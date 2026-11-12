import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

/** Onlook's app icon next to the wordmark. */
export function Logo({ size = 24 }: { size?: number }) {
    return (
        <View style={styles.row}>
            <Image
                source={require('../../assets/logo-mark.png')}
                style={{ width: size, height: size, borderRadius: size * 0.2 }}
            />
            <Text style={[styles.word, { fontSize: size * 0.8 }]}>Onlook</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    word: { color: colors.text, fontWeight: '700', letterSpacing: -0.3 },
});
