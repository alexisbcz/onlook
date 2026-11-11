import 'server-only';

import { db } from '@onlook/db/src/client';

import { createClient } from '@/utils/supabase/server';
import { verifySandboxAccess } from '../api/routers/project/helper';
import { isLocalSandboxEnabled } from './manager';

export class LocalSandboxHttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

/**
 * Local sandboxes execute commands on the host, so they are opt-in (ONLOOK_LOCAL_SANDBOXES=true)
 * and every request must come from a signed-in user who can access the sandbox's project.
 */
export async function authorizeLocalSandbox(sandboxId: string | null): Promise<string> {
    if (!isLocalSandboxEnabled()) {
        throw new LocalSandboxHttpError(404, 'Local sandboxes are disabled');
    }
    if (!sandboxId) {
        throw new LocalSandboxHttpError(400, 'Missing sandboxId');
    }
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        throw new LocalSandboxHttpError(401, 'Unauthorized');
    }
    try {
        await verifySandboxAccess(db, user.id, sandboxId);
    } catch {
        throw new LocalSandboxHttpError(403, 'Forbidden');
    }
    return user.id;
}
