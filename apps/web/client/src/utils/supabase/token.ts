import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';

/**
 * Supabase client acting as the user who owns `accessToken`. Used for requests from the
 * Onlook iOS/Android app, which authenticates with `Authorization: Bearer <access token>`
 * instead of cookies.
 */
export function createTokenClient(accessToken: string) {
    return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false },
    });
}

export function getBearerToken(headers: Headers): string | null {
    const match = /^Bearer\s+(.+)$/i.exec(headers.get('authorization') ?? '');
    return match?.[1]?.trim() ?? null;
}
