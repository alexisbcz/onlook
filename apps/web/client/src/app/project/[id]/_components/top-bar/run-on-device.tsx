import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';

import { LocalProvider } from '@onlook/code-provider';
import { EXPO_DEV_SERVER_PORT, isLocalSandboxId } from '@onlook/constants';
import { RouterType } from '@onlook/models';
import { Button } from '@onlook/ui/button';
import { Icons } from '@onlook/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@onlook/ui/popover';
import { toast } from '@onlook/ui/sonner';

import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';

/**
 * For React Native (Expo) projects: a QR code that opens the app in Expo Go on a real
 * iPhone or Android phone.
 */
export const RunOnDeviceButton = observer(() => {
    const editorEngine = useEditorEngine();
    const t = useTranslations();
    const sandbox = editorEngine.activeSandbox;
    const provider = sandbox.session.provider;
    const isExpo = sandbox.routerConfig?.type === RouterType.EXPO;
    const sandboxId = editorEngine.branches.activeBranch.sandbox.id;
    const isLocal = isLocalSandboxId(sandboxId);
    const [deviceUrl, setDeviceUrl] = useState<string | null>(null);

    useEffect(() => {
        if (provider && !sandbox.routerConfig) {
            void sandbox.getRouterConfig();
        }
    }, [provider, sandbox]);

    useEffect(() => {
        if (!isExpo) return;
        if (provider instanceof LocalProvider) {
            provider
                .getInfo()
                .then((info) =>
                    setDeviceUrl(`exp://${info.lanAddress ?? 'localhost'}:${info.port}`),
                )
                .catch(() => setDeviceUrl(null));
        } else {
            setDeviceUrl(`exp://${sandboxId}-${EXPO_DEV_SERVER_PORT}.csb.app`);
        }
    }, [isExpo, provider, sandboxId]);

    if (!isExpo) {
        return null;
    }

    const copy = async () => {
        if (!deviceUrl) return;
        await navigator.clipboard.writeText(deviceUrl);
        toast.success(t(transKeys.editor.toolbar.runOnDevice.copied));
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-small h-8 gap-1.5">
                    <Icons.Mobile className="h-4 w-4" />
                    {t(transKeys.editor.toolbar.runOnDevice.button)}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4">
                <p className="text-regularPlus text-foreground-primary">
                    {t(transKeys.editor.toolbar.runOnDevice.title)}
                </p>
                <p className="text-small text-foreground-secondary mt-1">
                    {t(transKeys.editor.toolbar.runOnDevice.description)}
                </p>
                {deviceUrl && (
                    <div className="mt-4 flex justify-center rounded-lg bg-white p-3">
                        <QRCodeSVG value={deviceUrl} size={176} />
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => void copy()}
                    className="bg-background-secondary text-mini text-foreground-secondary hover:text-foreground-primary mt-3 w-full truncate rounded-md px-2 py-1.5 text-left font-mono"
                    title={t(transKeys.editor.toolbar.runOnDevice.copy)}
                >
                    {deviceUrl}
                </button>
                <p className="text-mini text-foreground-tertiary mt-3">
                    {isLocal
                        ? t(transKeys.editor.toolbar.runOnDevice.lanHint)
                        : t(transKeys.editor.toolbar.runOnDevice.tunnelHint)}
                </p>
            </PopoverContent>
        </Popover>
    );
});
