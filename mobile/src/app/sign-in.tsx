import * as Linking from 'expo-linking';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { DEV_EMAIL, DEV_PASSWORD } from '@/lib/config';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

WebBrowser.maybeCompleteAuthSession();

/** GitHub/Google sign-in in the system browser, returning to `onlook://auth` (PKCE). */
async function signInWithProvider(provider: 'github' | 'google') {
    const redirectTo = Linking.createURL('auth');
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error('Could not start sign-in');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') return;
    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('Sign-in was cancelled');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
}

export default function SignIn() {
    const { session } = useSession();
    const [email, setEmail] = useState(DEV_EMAIL);
    const [password, setPassword] = useState(DEV_PASSWORD);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (session) return <Redirect href="/" />;

    const signIn = async () => {
        setIsLoading(true);
        setError(null);
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) setError(error.message);
        setIsLoading(false);
    };

    return (
        <SafeAreaView style={styles.screen}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.content}
            >
                <Logo size={30} />
                <Text style={styles.title}>Design your app with AI, in real code.</Text>
                <Text style={styles.subtitle}>
                    Sign in to edit your Onlook projects from your phone.
                </Text>

                <View style={styles.form}>
                    {(['github', 'google'] as const).map((provider) => (
                        <Pressable
                            key={provider}
                            onPress={() =>
                                void signInWithProvider(provider).catch((e: Error) => setError(e.message))
                            }
                            style={({ pressed }) => [styles.secondaryButton, pressed && { opacity: 0.7 }]}
                        >
                            <Text style={styles.secondaryButtonText}>
                                Continue with {provider === 'github' ? 'GitHub' : 'Google'}
                            </Text>
                        </Pressable>
                    ))}
                    <View style={styles.divider}>
                        <View style={styles.dividerLine} />
                        <Text style={styles.dividerText}>or</Text>
                        <View style={styles.dividerLine} />
                    </View>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Email"
                        placeholderTextColor={colors.textTertiary}
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        style={styles.input}
                    />
                    <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Password"
                        placeholderTextColor={colors.textTertiary}
                        secureTextEntry
                        autoComplete="password"
                        style={styles.input}
                        onSubmitEditing={() => void signIn()}
                    />
                    {error && <Text style={styles.error}>{error}</Text>}
                    <Pressable
                        onPress={() => void signIn()}
                        disabled={isLoading || !email || !password}
                        style={({ pressed }) => [
                            styles.button,
                            (pressed || isLoading) && { opacity: 0.8 },
                            (!email || !password) && { opacity: 0.4 },
                        ]}
                    >
                        {isLoading ? (
                            <ActivityIndicator color={colors.accentText} />
                        ) : (
                            <Text style={styles.buttonText}>Sign in</Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    title: { color: colors.text, fontSize: 30, fontWeight: '700', marginTop: 40, letterSpacing: -0.6 },
    subtitle: { color: colors.textSecondary, fontSize: 16, marginTop: 10, lineHeight: 22 },
    form: { marginTop: 36, gap: 12 },
    input: {
        height: 52,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        color: colors.text,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    error: { color: colors.danger, fontSize: 14 },
    button: {
        height: 52,
        borderRadius: 12,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4,
    },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
    secondaryButton: {
        height: 52,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: { color: colors.text, fontSize: 16, fontWeight: '500' },
    divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
    dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    dividerText: { color: colors.textTertiary, fontSize: 13 },
});
