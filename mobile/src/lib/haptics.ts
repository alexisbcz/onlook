import * as Haptics from 'expo-haptics';

/** Haptics are a nicety: ignore devices or Expo Go builds that don't support a call. */
const safe = (run: () => Promise<void>) => {
    try {
        void run().catch(() => undefined);
    } catch {
        // not available
    }
};

export const haptics = {
    selection: () => safe(() => Haptics.selectionAsync()),
    impact: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
    success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
};
