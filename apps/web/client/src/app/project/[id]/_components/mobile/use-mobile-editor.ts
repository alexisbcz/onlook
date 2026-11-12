import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

/** Set by the Onlook iOS/Android app (`?client=ios|android`), remembered for the session. */
const CLIENT_STORAGE_KEY = 'onlook-native-client';

export type NativeClient = 'ios' | 'android' | null;

export function getNativeClient(): NativeClient {
    if (typeof window === 'undefined') return null;
    const param = new URLSearchParams(window.location.search).get('client');
    if (param === 'ios' || param === 'android') {
        sessionStorage.setItem(CLIENT_STORAGE_KEY, param);
        return param;
    }
    const stored = sessionStorage.getItem(CLIENT_STORAGE_KEY);
    return stored === 'ios' || stored === 'android' ? stored : null;
}

/**
 * The phone layout is used on narrow screens and always inside the native app.
 */
export function useMobileEditor(): { isMobile: boolean; nativeClient: NativeClient } {
    const [state, setState] = useState<{ isMobile: boolean; nativeClient: NativeClient }>({
        isMobile: false,
        nativeClient: null,
    });

    useEffect(() => {
        const media = window.matchMedia(MOBILE_QUERY);
        const update = () => {
            const nativeClient = getNativeClient();
            setState({ isMobile: media.matches || nativeClient !== null, nativeClient });
        };
        update();
        media.addEventListener('change', update);
        return () => media.removeEventListener('change', update);
    }, []);

    return state;
}

/** Sends a message to the native app hosting this page, if any. */
export function postToNativeApp(message: { type: string; [key: string]: unknown }) {
    const bridge = (window as unknown as { ReactNativeWebView?: { postMessage: (data: string) => void } })
        .ReactNativeWebView;
    bridge?.postMessage(JSON.stringify(message));
}
