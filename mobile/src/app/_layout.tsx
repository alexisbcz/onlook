import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SessionProvider } from '@/lib/session';
import { colors } from '@/lib/theme';

export default function RootLayout() {
    return (
        <SafeAreaProvider>
            <SessionProvider>
                <StatusBar style="light" />
                <Stack
                    screenOptions={{
                        headerShown: false,
                        contentStyle: { backgroundColor: colors.background },
                    }}
                >
                    <Stack.Screen name="index" />
                    <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
                    <Stack.Screen name="new" options={{ presentation: 'modal' }} />
                    <Stack.Screen name="project/[id]" options={{ gestureEnabled: false }} />
                </Stack>
            </SessionProvider>
        </SafeAreaProvider>
    );
}
