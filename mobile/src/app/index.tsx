import { haptics } from '@/lib/haptics';
import { Image } from 'expo-image';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/logo';
import { api, type Project } from '@/lib/api';
import { SUPABASE_URL } from '@/lib/config';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

function previewUrl(project: Project): string | null {
    const img = project.metadata.previewImg;
    if (!img) return null;
    if (img.type === 'url') return img.url ?? null;
    if (img.storagePath) {
        return `${SUPABASE_URL}/storage/v1/object/public/${img.storagePath.bucket}/${img.storagePath.path}`;
    }
    return null;
}

function timeAgo(date: Date): string {
    const seconds = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 1000));
    const units: [number, string][] = [
        [86400 * 365, 'y'],
        [86400 * 30, 'mo'],
        [86400, 'd'],
        [3600, 'h'],
        [60, 'm'],
    ];
    for (const [size, label] of units) {
        if (seconds >= size) return `${Math.floor(seconds / size)}${label} ago`;
    }
    return 'just now';
}

export default function Projects() {
    const { session, isLoading } = useSession();
    const [projects, setProjects] = useState<Project[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        try {
            setError(null);
            setProjects(await api.listProjects());
        } catch (e) {
            setError((e as Error).message);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (session) void load();
        }, [session, load]),
    );

    if (isLoading) return <View style={styles.screen} />;
    if (!session) return <Redirect href="/sign-in" />;

    const refresh = async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    };

    const showAccountMenu = () => {
        const signOut = () => void supabase.auth.signOut();
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                {
                    title: session.user.email,
                    options: ['Sign out', 'Cancel'],
                    destructiveButtonIndex: 0,
                    cancelButtonIndex: 1,
                },
                (index) => index === 0 && signOut(),
            );
        } else {
            Alert.alert(session.user.email ?? 'Account', undefined, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: signOut },
            ]);
        }
    };

    const confirmDelete = (project: Project) => {
        haptics.impact();
        Alert.alert(`Delete “${project.name}”?`, 'This removes the project for everyone on it.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: () =>
                    void api
                        .deleteProject(project.id)
                        .then(load)
                        .catch((e: Error) => Alert.alert('Could not delete', e.message)),
            },
        ]);
    };

    const initial = (session.user.email ?? '?').slice(0, 1).toUpperCase();

    return (
        <SafeAreaView style={styles.screen} edges={['top']}>
            <View style={styles.header}>
                <Logo />
                <Pressable onPress={showAccountMenu} style={styles.avatar} hitSlop={8}>
                    <Text style={styles.avatarText}>{initial}</Text>
                </Pressable>
            </View>

            <FlatList
                data={projects ?? []}
                keyExtractor={(project) => project.id}
                contentContainerStyle={styles.list}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.text} />
                }
                ListHeaderComponent={<Text style={styles.title}>Projects</Text>}
                ListEmptyComponent={
                    projects === null && !error ? (
                        <ActivityIndicator color={colors.text} style={{ marginTop: 48 }} />
                    ) : (
                        <View style={styles.empty}>
                            <Text style={styles.emptyTitle}>{error ? 'Couldn’t load projects' : 'No projects yet'}</Text>
                            <Text style={styles.emptyText}>
                                {error ?? 'Start a website or an iOS and Android app. You can keep editing it here or on the web.'}
                            </Text>
                        </View>
                    )
                }
                renderItem={({ item }) => {
                    const uri = previewUrl(item);
                    return (
                        <Pressable
                            onPress={() => router.push({ pathname: '/project/[id]', params: { id: item.id, name: item.name } })}
                            onLongPress={() => confirmDelete(item)}
                            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                        >
                            <View style={styles.preview}>
                                {uri ? (
                                    <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                                ) : (
                                    <Text style={styles.previewLetter}>{item.name.slice(0, 1).toUpperCase()}</Text>
                                )}
                                {item.metadata.tags.includes('mobile') || item.metadata.tags.includes('expo') ? (
                                    <View style={styles.badge}>
                                        <Text style={styles.badgeText}>iOS · Android</Text>
                                    </View>
                                ) : null}
                            </View>
                            <View style={styles.cardBody}>
                                <Text style={styles.cardTitle} numberOfLines={1}>
                                    {item.name}
                                </Text>
                                <Text style={styles.cardMeta}>Edited {timeAgo(item.metadata.updatedAt)}</Text>
                            </View>
                        </Pressable>
                    );
                }}
            />

            <Pressable
                style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.97 }] }]}
                onPressIn={() => haptics.selection()}
                onPress={() => router.push('/new')}
            >
                <Text style={styles.fabText}>New project</Text>
            </Pressable>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        height: 52,
    },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: colors.surfaceRaised,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { color: colors.text, fontWeight: '600' },
    list: { paddingHorizontal: 20, paddingBottom: 120, gap: 16 },
    title: { color: colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.6, marginTop: 12, marginBottom: 4 },
    card: {
        borderRadius: 16,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
    },
    preview: {
        height: 168,
        backgroundColor: colors.surfaceRaised,
        alignItems: 'center',
        justifyContent: 'center',
    },
    previewLetter: { color: colors.textTertiary, fontSize: 56, fontWeight: '700' },
    badge: {
        position: 'absolute',
        top: 12,
        left: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    badgeText: { color: colors.text, fontSize: 12, fontWeight: '600' },
    cardBody: { padding: 14, gap: 4 },
    cardTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
    cardMeta: { color: colors.textSecondary, fontSize: 14 },
    empty: { marginTop: 64, alignItems: 'center', paddingHorizontal: 24 },
    emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
    emptyText: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21 },
    fab: {
        position: 'absolute',
        bottom: 36,
        alignSelf: 'center',
        backgroundColor: colors.accent,
        borderRadius: 999,
        paddingHorizontal: 28,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOpacity: 0.4,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    fabText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
});
