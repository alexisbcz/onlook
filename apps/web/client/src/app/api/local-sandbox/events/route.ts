import { type NextRequest } from 'next/server';

import { authorizeLocalSandbox, LocalSandboxHttpError } from '@/server/local-sandbox/auth';
import { getLocalSandbox } from '@/server/local-sandbox/manager';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-sent events for a local sandbox.
 * - `channel=watch`: file changes `{ type, paths }`
 * - `channel=process&id=<id>`: process output chunks `{ data }`
 */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const sandboxId = params.get('sandboxId');
    try {
        await authorizeLocalSandbox(sandboxId);
    } catch (error) {
        const status = error instanceof LocalSandboxHttpError ? error.status : 500;
        return new Response(error instanceof Error ? error.message : 'Error', { status });
    }

    const sandbox = await getLocalSandbox(sandboxId!);
    const channel = params.get('channel');
    const encoder = new TextEncoder();
    let cleanup: () => void = () => undefined;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (payload: unknown) => {
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                } catch {
                    cleanup();
                }
            };
            const keepAlive = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': ping\n\n'));
                } catch {
                    cleanup();
                }
            }, 15_000);

            if (channel === 'watch') {
                const unsubscribe = sandbox.subscribeToWatch(send);
                cleanup = () => {
                    clearInterval(keepAlive);
                    unsubscribe();
                };
            } else if (channel === 'process') {
                const id = params.get('id') ?? '';
                const proc = id === 'dev' ? sandbox.getDevTask() : sandbox.processes.get(id);
                if (!proc) {
                    clearInterval(keepAlive);
                    controller.close();
                    return;
                }
                const onOutput = (data: string) => send({ data });
                proc.on('output', onOutput);
                cleanup = () => {
                    clearInterval(keepAlive);
                    proc.off('output', onOutput);
                };
            } else {
                clearInterval(keepAlive);
                controller.close();
            }
        },
        cancel() {
            cleanup();
        },
    });

    request.signal.addEventListener('abort', () => cleanup());

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
