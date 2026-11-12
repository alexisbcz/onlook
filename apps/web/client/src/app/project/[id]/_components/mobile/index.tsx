'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { Icons } from '@onlook/ui/icons';
import { TooltipProvider } from '@onlook/ui/tooltip';
import { cn } from '@onlook/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { Canvas } from '../canvas';
import { EditorBar } from '../editor-bar';
import { LayersTab } from '../left-panel/design-panel/layers-tab';
import { PagesTab } from '../left-panel/design-panel/page-tab';
import { ChatTab } from '../right-panel/chat-tab';
import { postToNativeApp, type NativeClient } from './use-mobile-editor';

type MobileTab = 'design' | 'chat' | 'pages' | 'layers';

/** Space reserved above a frame for its title bar, in canvas units. */
const FRAME_BAR_HEIGHT = 44;
const FIT_MARGIN = 12;
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const TAP_SLOP = 8;
const REPLAYED_EVENTS = new WeakSet<Event>();

/**
 * The editor on a phone: one frame fitted to the screen, touch to pan and pinch to zoom,
 * the style toolbar above a bottom tab bar, and chat, pages and layers as full-screen sheets.
 */
export const MobileMain = observer(({ nativeClient }: { nativeClient: NativeClient }) => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const router = useRouter();
    const [tab, setTab] = useState<MobileTab>('design');
    const [frameIndex, setFrameIndex] = useState(0);
    const canvasAreaRef = useRef<HTMLDivElement | null>(null);
    const { data: project } = api.project.get.useQuery({ projectId: editorEngine.projectId });

    const frames = editorEngine.frames.getAll();
    const hasSelection = editorEngine.elements.selected.length > 0;
    const conversation = editorEngine.chat.conversation.current;

    const fitToFrame = useCallback(
        (index: number) => {
            const frame = editorEngine.frames.getAll()[index]?.frame;
            const area = canvasAreaRef.current?.getBoundingClientRect();
            if (!frame || !area) return;
            const scale = Math.min(
                (area.width - FIT_MARGIN * 2) / frame.dimension.width,
                (area.height - FIT_MARGIN * 2) / (frame.dimension.height + FRAME_BAR_HEIGHT),
                1,
            );
            const scaledWidth = frame.dimension.width * scale;
            editorEngine.canvas.scale = scale;
            editorEngine.canvas.position = {
                x: (area.width - scaledWidth) / 2 - frame.position.x * scale,
                y: FIT_MARGIN + FRAME_BAR_HEIGHT * scale - frame.position.y * scale,
            };
        },
        [editorEngine],
    );

    // Fit the first frame once frames are loaded, and again when the screen rotates.
    useEffect(() => {
        if (frames.length === 0) return;
        fitToFrame(frameIndex);
        const onResize = () => fitToFrame(frameIndex);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [frames.length, frameIndex, fitToFrame]);

    // Picking a page navigates a frame; go back to the canvas to show it.
    useEffect(() => {
        if (tab !== 'pages') return;
        return reaction(
            () => editorEngine.frames.getAll().map((f) => f.frame.url).join('|'),
            () => setTab('design'),
        );
    }, [tab, editorEngine]);

    useEffect(() => {
        postToNativeApp({ type: 'ready', projectName: project?.name ?? null });
    }, [project?.name]);

    // Touch gestures: one finger pans, two fingers pinch-zoom. Taps fall through as clicks,
    // which the canvas turns into element selection.
    const gesture = useRef<{
        startTouches: { x: number; y: number }[];
        startPosition: { x: number; y: number };
        startScale: number;
        moved: boolean;
    } | null>(null);

    const touchPoints = (e: React.TouchEvent) =>
        Array.from(e.touches).map((touch) => ({ x: touch.clientX, y: touch.clientY }));

    const onTouchStart = (e: React.TouchEvent) => {
        gesture.current = {
            startTouches: touchPoints(e),
            startPosition: { ...editorEngine.canvas.position },
            startScale: editorEngine.canvas.scale,
            moved: false,
        };
    };

    const onTouchMove = (e: React.TouchEvent) => {
        const g = gesture.current;
        if (!g) return;
        const points = touchPoints(e);
        const [a, b] = points;
        const [a0, b0] = g.startTouches;
        if (!a || !a0) return;

        if (b && b0) {
            const distance = Math.hypot(b.x - a.x, b.y - a.y);
            const startDistance = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
            const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (g.startScale * distance) / startDistance));
            const area = canvasAreaRef.current?.getBoundingClientRect();
            const cx = (a0.x + b0.x) / 2 - (area?.left ?? 0);
            const cy = (a0.y + b0.y) / 2 - (area?.top ?? 0);
            const ratio = scale / g.startScale;
            editorEngine.canvas.scale = scale;
            editorEngine.canvas.position = {
                x: cx - (cx - g.startPosition.x) * ratio + ((a.x + b.x) / 2 - (a0.x + b0.x) / 2),
                y: cy - (cy - g.startPosition.y) * ratio + ((a.y + b.y) / 2 - (a0.y + b0.y) / 2),
            };
            g.moved = true;
            return;
        }

        const dx = a.x - a0.x;
        const dy = a.y - a0.y;
        if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
        g.moved = true;
        editorEngine.canvas.position = { x: g.startPosition.x + dx, y: g.startPosition.y + dy };
    };

    const onTouchEnd = (e: React.TouchEvent) => {
        if (gesture.current?.moved) {
            // Don't let a pan end in a click that selects whatever is under the finger.
            e.preventDefault();
        }
        gesture.current = null;
    };

    // Radix menus open on pointerdown, so swiping the toolbar would open whatever control the
    // finger landed on. Hold touch pointerdowns back and replay them only for real taps.
    const lastToolbarPointer = useRef<string | null>(null);
    const onToolbarPointerDown = (e: React.PointerEvent) => {
        if (REPLAYED_EVENTS.has(e.nativeEvent)) return;
        lastToolbarPointer.current = e.pointerType;
        if (e.pointerType === 'touch') e.stopPropagation();
    };
    const onToolbarClick = (e: React.MouseEvent) => {
        if (lastToolbarPointer.current !== 'touch') return;
        const trigger = (e.target as HTMLElement).closest('[aria-haspopup="menu"]');
        if (!trigger) return;
        const replay = new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerType: 'mouse',
        });
        REPLAYED_EVENTS.add(replay);
        trigger.dispatchEvent(replay);
    };

    const goBack = () => {
        if (nativeClient) {
            postToNativeApp({ type: 'close' });
        } else {
            router.push(Routes.PROJECTS);
        }
    };

    const tabs: { value: MobileTab; label: string; icon: React.ReactNode }[] = [
        { value: 'design', label: t(transKeys.editor.mobile.design), icon: <Icons.Pencil className="h-5 w-5" /> },
        { value: 'chat', label: t(transKeys.editor.mobile.chat), icon: <Icons.Sparkles className="h-5 w-5" /> },
        { value: 'pages', label: t(transKeys.editor.mobile.pages), icon: <Icons.File className="h-5 w-5" /> },
        { value: 'layers', label: t(transKeys.editor.mobile.layers), icon: <Icons.Layers className="h-5 w-5" /> },
    ];

    return (
        <TooltipProvider>
            <div
                className="bg-background-onlook relative flex h-[100dvh] w-screen select-none flex-col overflow-hidden"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
            >
                {/* Top bar */}
                <div className="border-border flex h-12 shrink-0 items-center gap-1 border-b px-2">
                    <button
                        type="button"
                        onClick={goBack}
                        aria-label={t(transKeys.editor.mobile.back)}
                        className="text-foreground-secondary flex h-10 w-10 items-center justify-center"
                    >
                        <Icons.ArrowLeft className="h-5 w-5" />
                    </button>
                    <p className="text-regularPlus text-foreground-primary min-w-0 flex-1 truncate px-1">
                        {project?.name}
                    </p>
                    {frames.length > 1 && (
                        <button
                            type="button"
                            onClick={() => setFrameIndex((frameIndex + 1) % frames.length)}
                            className="text-small text-foreground-secondary bg-background-secondary flex h-8 items-center gap-1 rounded-full px-3"
                        >
                            <Icons.Mobile className="h-4 w-4" />
                            {frameIndex + 1}/{frames.length}
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label={t(transKeys.editor.mobile.undo)}
                        disabled={!editorEngine.history.canUndo}
                        onClick={() => void editorEngine.action.undo()}
                        className="text-foreground-secondary flex h-10 w-10 items-center justify-center disabled:opacity-30"
                    >
                        <Icons.Reset className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        aria-label={t(transKeys.editor.mobile.redo)}
                        disabled={!editorEngine.history.canRedo}
                        onClick={() => void editorEngine.action.redo()}
                        className="text-foreground-secondary flex h-10 w-10 items-center justify-center disabled:opacity-30"
                    >
                        <Icons.Reset className="h-4 w-4 scale-x-[-1]" />
                    </button>
                </div>

                {/* Canvas */}
                <div
                    ref={canvasAreaRef}
                    className="relative flex min-h-0 flex-1 touch-none"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                >
                    <Canvas />

                    {tab !== 'design' && (
                        <div className="bg-background absolute inset-0 z-50 flex flex-col overflow-hidden">
                            {tab === 'chat' && conversation && (
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    <ChatTab
                                        conversationId={conversation.id}
                                        projectId={editorEngine.projectId}
                                    />
                                </div>
                            )}
                            {tab === 'pages' && (
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    <PagesTab />
                                </div>
                            )}
                            {tab === 'layers' && (
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    <LayersTab />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Style toolbar for the selected element */}
                {tab === 'design' && hasSelection && (
                    <div
                        className="border-border shrink-0 overflow-x-auto border-t [scrollbar-width:none]"
                        onPointerDownCapture={onToolbarPointerDown}
                        onClickCapture={onToolbarClick}
                    >
                        <div className="w-max">
                            <EditorBar availableWidth={10_000} />
                        </div>
                    </div>
                )}

                {/* Tab bar */}
                <nav
                    className="border-border bg-background flex shrink-0 border-t"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    {tabs.map((item) => (
                        <button
                            key={item.value}
                            type="button"
                            onClick={() => setTab(item.value)}
                            className={cn(
                                'text-mini flex h-14 flex-1 flex-col items-center justify-center gap-1',
                                tab === item.value
                                    ? 'text-foreground-primary'
                                    : 'text-foreground-tertiary',
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>
            </div>
        </TooltipProvider>
    );
});
