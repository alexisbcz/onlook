import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Profile() {
    return (
        <SafeAreaView className="flex-1 bg-stone-50 px-5">
            <Link href="/" asChild>
                <Pressable className="pt-4">
                    <Text className="text-base text-emerald-700">Back</Text>
                </Pressable>
            </Link>
            <View className="mt-8 items-center">
                <View className="h-24 w-24 items-center justify-center rounded-full bg-emerald-700">
                    <Text className="text-3xl font-bold text-white">AB</Text>
                </View>
                <Text className="mt-4 text-2xl font-bold text-stone-900">Alex B.</Text>
                <Text className="mt-1 text-stone-500">42 trails · 318 km this year</Text>
            </View>
        </SafeAreaView>
    );
}
