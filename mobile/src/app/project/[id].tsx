import { haptics } from '@/lib/haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { ONLOOK_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

/** Back to the projects list, even when this screen was opened directly (deep link, reload). */
const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

// react-native-webview's typings default the extra-props generic to `undefined`, which
// intersects to `never` with current TypeScript. Instantiate it with `object` instead.
const EditorWebView = WebView<object>;

type EditorMessage = { type: 'ready'; projectName: string | null } | { type: 'close' };

/**
 * The editor is Onlook's web editor in its phone layout. The app passes its session to the
 * WebView once (`/auth/mobile`, see apps/web/client/src/app/auth/mobile/page.tsx) and the
 * editor talks back through `window.ReactNativeWebView.postMessage`.
 */
export default function ProjectEditor() {
    const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
    const { session } = useSession();
    const webView = useRef<WebView<object>>(null);
    const [isReady, setIsReady] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Build the URL once so token refreshes don't reload the editor.
    const uri = useMemo(() => {
        const next = `/project/${id}?client=${Platform.OS === 'ios' ? 'ios' : 'android'}`;
        const fragment = new URLSearchParams({
            access_token: session?.access_token ?? '',
            refresh_token: session?.refresh_token ?? '',
            next,
        });
        return `${ONLOOK_URL}/auth/mobile#${fragment.toString()}`;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // If the editor can't load (e.g. the server is unreachable), show the web page's own error.
    useEffect(() => {
        const timer = setTimeout(() => setIsReady(true), 20_000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            goBack();
            return true;
        });
        return () => sub.remove();
    }, []);

    const retry = () => {
        setLoadError(null);
        webView.current?.reload();
    };

    const onMessage = (event: WebViewMessageEvent) => {
        let message: EditorMessage;
        try {
            message = JSON.parse(event.nativeEvent.data) as EditorMessage;
        } catch {
            return;
        }
        if (message.type === 'ready') {
            setIsReady(true);
        } else if (message.type === 'close') {
            haptics.selection();
            goBack();
        }
    };

    return (
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
            {/* Android doesn't resize the WebView for the keyboard, so the chat input would hide behind it. */}
            <KeyboardAvoidingView
                style={styles.webView}
                behavior={Platform.OS === 'android' ? 'height' : undefined}
                enabled={Platform.OS === 'android'}
            >
                <EditorWebView
                    ref={webView}
                    source={{ uri }}
                    style={styles.webView}
                    onMessage={onMessage}
                    onError={(event) => setLoadError(event.nativeEvent.description)}
                    onLoadStart={() => setLoadError(null)}
                    originWhitelist={['*']}
                    javaScriptEnabled
                    domStorageEnabled
                    sharedCookiesEnabled
                    thirdPartyCookiesEnabled
                    mixedContentMode="always"
                    allowsInlineMediaPlayback
                    bounces={false}
                    overScrollMode="never"
                    setSupportMultipleWindows={false}
                    hideKeyboardAccessoryView
                    keyboardDisplayRequiresUserAction={false}
                    webviewDebuggingEnabled={__DEV__}
                />
            </KeyboardAvoidingView>
            {loadError ? (
                <View style={styles.loading}>
                    <Text style={styles.errorTitle}>Couldn’t open {name ?? 'this project'}</Text>
                    <Text style={styles.loadingText}>{loadError}</Text>
                    <View style={styles.errorActions}>
                        <Pressable onPress={goBack} style={styles.secondaryButton}>
                            <Text style={styles.secondaryButtonText}>Back</Text>
                        </Pressable>
                        <Pressable onPress={retry} style={styles.button}>
                            <Text style={styles.buttonText}>Try again</Text>
                        </Pressable>
                    </View>
                </View>
            ) : !isReady && (
                <View style={styles.loading} pointerEvents="none">
                    <ActivityIndicator color={colors.text} />
                    <Text style={styles.loadingText}>Opening {name ?? 'project'}…</Text>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    webView: { flex: 1, backgroundColor: colors.background },
    loading: {
        ...StyleSheet.absoluteFill,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    loadingText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
    errorTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
    errorActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
    button: {
        height: 46,
        paddingHorizontal: 22,
        borderRadius: 12,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
    secondaryButton: {
        height: 46,
        paddingHorizontal: 22,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '500' },
});
