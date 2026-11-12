import { haptics } from '@/lib/haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, type TemplateKey } from '@/lib/api';
import { useSession } from '@/lib/session';
import { colors } from '@/lib/theme';

/** Back to the projects list, even when this screen was opened directly (deep link, reload). */
const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

const OPTIONS: { key: TemplateKey; title: string; description: string; defaultName: string }[] = [
    {
        key: 'mobile',
        title: 'Mobile app',
        description: 'iOS and Android, built with Expo and React Native.',
        defaultName: 'New Mobile App',
    },
    {
        key: 'web',
        title: 'Website',
        description: 'A Next.js and Tailwind site.',
        defaultName: 'New Project',
    },
];

export default function NewProject() {
    const { session } = useSession();
    const [template, setTemplate] = useState<TemplateKey>('mobile');
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const create = async () => {
        if (!session) return;
        setIsCreating(true);
        setError(null);
        try {
            const option = OPTIONS.find((o) => o.key === template)!;
            const project = await api.createProject({
                userId: session.user.id,
                template,
                name: name.trim() || option.defaultName,
                prompt: prompt.trim() || undefined,
            });
            haptics.success();
            router.replace({ pathname: '/project/[id]', params: { id: project.id, name: project.name } });
        } catch (e) {
            setError((e as Error).message);
            setIsCreating(false);
        }
    };

    return (
        <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
            <View style={styles.header}>
                <Pressable onPress={() => goBack()} hitSlop={12}>
                    <Text style={styles.cancel}>Cancel</Text>
                </Pressable>
                <Text style={styles.headerTitle}>New project</Text>
                <View style={{ width: 52 }} />
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                    <Text style={styles.label}>Start from</Text>
                    {OPTIONS.map((option) => {
                        const selected = option.key === template;
                        return (
                            <Pressable
                                key={option.key}
                                onPress={() => {
                                    haptics.selection();
                                    setTemplate(option.key);
                                }}
                                style={[styles.option, selected && styles.optionSelected]}
                            >
                                <View style={[styles.radio, selected && styles.radioSelected]}>
                                    {selected && <View style={styles.radioDot} />}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.optionTitle}>{option.title}</Text>
                                    <Text style={styles.optionText}>{option.description}</Text>
                                </View>
                            </Pressable>
                        );
                    })}

                    <Text style={[styles.label, { marginTop: 24 }]}>Name</Text>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder={OPTIONS.find((o) => o.key === template)?.defaultName}
                        placeholderTextColor={colors.textTertiary}
                        style={styles.input}
                    />

                    <Text style={[styles.label, { marginTop: 24 }]}>What should it be? (optional)</Text>
                    <TextInput
                        value={prompt}
                        onChangeText={setPrompt}
                        placeholder="A habit tracker with a weekly streak view…"
                        placeholderTextColor={colors.textTertiary}
                        multiline
                        style={[styles.input, styles.prompt]}
                    />
                    <Text style={styles.hint}>Onlook’s AI starts building from this when the project opens.</Text>

                    {error && <Text style={styles.error}>{error}</Text>}
                </ScrollView>

                <View style={styles.footer}>
                    <Pressable
                        onPress={() => void create()}
                        disabled={isCreating}
                        style={({ pressed }) => [styles.button, (pressed || isCreating) && { opacity: 0.85 }]}
                    >
                        {isCreating ? (
                            <View style={styles.row}>
                                <ActivityIndicator color={colors.accentText} />
                                <Text style={styles.buttonText}>Setting up your project…</Text>
                            </View>
                        ) : (
                            <Text style={styles.buttonText}>Create</Text>
                        )}
                    </Pressable>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    cancel: { color: colors.textSecondary, fontSize: 16 },
    headerTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
    content: { padding: 20 },
    label: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        marginBottom: 10,
    },
    optionSelected: { borderColor: colors.text },
    radio: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: colors.textTertiary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioSelected: { borderColor: colors.text },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.text },
    optionTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
    optionText: { color: colors.textSecondary, fontSize: 14, marginTop: 2 },
    input: {
        minHeight: 52,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        color: colors.text,
        paddingHorizontal: 16,
        fontSize: 16,
    },
    prompt: { minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
    hint: { color: colors.textTertiary, fontSize: 13, marginTop: 8 },
    error: { color: colors.danger, fontSize: 14, marginTop: 16 },
    footer: { padding: 20, paddingTop: 8 },
    button: {
        height: 54,
        borderRadius: 14,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
});
