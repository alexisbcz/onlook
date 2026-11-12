'use client';

import { useEffect, useState } from 'react';

import { Icons } from '@onlook/ui/icons';

import { createClient } from '@/utils/supabase/client';

/**
 * Session handoff for the Onlook iOS/Android app.
 *
 * The app signs in natively, then opens this page in its WebView with the session in the URL
 * fragment (`#access_token=…&refresh_token=…&next=/project/…`). The fragment never reaches the
 * server. The page stores the session as cookies, like a normal web sign-in, and continues to
 * `next`. It only runs inside the app's WebView, so a link can't sign someone into another account.
 */
export default function MobileAuthPage() {
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        history.replaceState(null, '', window.location.pathname);

        const isNativeApp = 'ReactNativeWebView' in window;
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const next = params.get('next') ?? '/projects';
        const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/projects';

        if (!isNativeApp || !accessToken || !refreshToken) {
            setError('Open this page from the Onlook app.');
            return;
        }

        void createClient()
            .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(({ error }) => {
                if (error) {
                    setError(error.message);
                    return;
                }
                window.location.replace(safeNext);
            });
    }, []);

    return (
        <div className="flex h-[100dvh] w-screen items-center justify-center gap-2">
            {error ? (
                <p className="text-foreground-secondary text-regular px-6 text-center">{error}</p>
            ) : (
                <Icons.LoadingSpinner className="text-foreground-primary h-6 w-6 animate-spin" />
            )}
        </div>
    );
}
