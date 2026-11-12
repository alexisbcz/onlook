/**
 * Where the app finds Onlook. Set these in `mobile/.env` (see `.env.example`).
 * On an Android emulator, `adb reverse tcp:3000 tcp:3000` makes `localhost` reach your machine.
 */
export const ONLOOK_URL = (process.env.EXPO_PUBLIC_ONLOOK_URL ?? 'https://onlook.com').replace(/\/$/, '');
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Prefills the sign-in form in development builds only. */
export const DEV_EMAIL = __DEV__ ? (process.env.EXPO_PUBLIC_DEV_EMAIL ?? '') : '';
export const DEV_PASSWORD = __DEV__ ? (process.env.EXPO_PUBLIC_DEV_PASSWORD ?? '') : '';
