import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { authorizeLocalSandbox, LocalSandboxHttpError } from '@/server/local-sandbox/auth';
import { runLocalSandboxOperation } from '@/server/local-sandbox/operations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            sandboxId?: string;
            op?: string;
            args?: Record<string, unknown>;
        };
        await authorizeLocalSandbox(body.sandboxId ?? null);
        if (!body.op) {
            return NextResponse.json({ error: 'Missing op' }, { status: 400 });
        }
        const result = await runLocalSandboxOperation(body.sandboxId!, body.op, body.args ?? {});
        return NextResponse.json(result);
    } catch (error) {
        const status = error instanceof LocalSandboxHttpError ? error.status : 500;
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: message }, { status });
    }
}
