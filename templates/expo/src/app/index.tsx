import { Link } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const trails = [
    { name: 'Calanques de Sugiton', distance: '6.2 km', time: '2h 10m', level: 'Moderate' },
    { name: 'Lac Blanc', distance: '9.8 km', time: '4h 30m', level: 'Hard' },
    { name: 'Gorges du Verdon', distance: '14 km', time: '6h', level: 'Hard' },
];

export default function Home() {
    return (
        <SafeAreaView className="flex-1 bg-stone-50">
            <ScrollView contentContainerClassName="px-5 pb-10">
                <View className="flex-row items-center justify-between pt-4">
                    <View>
                        <Text className="text-sm text-stone-500">Good morning</Text>
                        <Text className="text-2xl font-bold text-stone-900">Where to today?</Text>
                    </View>
                    <Link href="/profile" asChild>
                        <Pressable className="h-11 w-11 items-center justify-center rounded-full bg-emerald-700">
                            <Text className="font-semibold text-white">AB</Text>
                        </Pressable>
                    </Link>
                </View>

                <View className="mt-6 rounded-3xl bg-emerald-800 p-6">
                    <Text className="text-xs font-semibold uppercase text-emerald-200">This weekend</Text>
                    <Text className="mt-2 text-3xl font-bold text-white">Sunrise over the Alps</Text>
                    <Text className="mt-2 text-base text-emerald-100">
                        Three trails with clear skies and under 2 hours from Lyon.
                    </Text>
                    <Pressable className="mt-5 self-start rounded-full bg-white px-5 py-3">
                        <Text className="font-semibold text-emerald-900">Plan a hike</Text>
                    </Pressable>
                </View>

                <Text className="mt-8 text-lg font-semibold text-stone-900">Popular trails</Text>
                {trails.map((trail) => (
                    <View
                        key={trail.name}
                        className="mt-3 flex-row items-center rounded-2xl border border-stone-200 bg-white p-4"
                    >
                        <View className="h-14 w-14 rounded-xl bg-amber-200" />
                        <View className="ml-4 flex-1">
                            <Text className="text-base font-semibold text-stone-900">{trail.name}</Text>
                            <Text className="mt-1 text-sm text-stone-500">
                                {trail.distance} · {trail.time}
                            </Text>
                        </View>
                        <Text className="text-xs font-medium text-stone-600">{trail.level}</Text>
                    </View>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}
