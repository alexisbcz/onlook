import { describe, expect, test } from 'bun:test';

import { RouterType } from '@onlook/models';

import { isRootLayoutFile } from '../src/path';

describe('isRootLayoutFile with Expo Router', () => {
    test('matches the root _layout in app/ and src/app/', () => {
        expect(isRootLayoutFile('app/_layout.tsx', RouterType.EXPO)).toBe(true);
        expect(isRootLayoutFile('src/app/_layout.tsx', RouterType.EXPO)).toBe(true);
    });

    test('ignores nested layouts and Next.js layouts', () => {
        expect(isRootLayoutFile('src/app/(tabs)/_layout.tsx', RouterType.EXPO)).toBe(false);
        expect(isRootLayoutFile('src/app/layout.tsx', RouterType.EXPO)).toBe(false);
        expect(isRootLayoutFile('src/app/_layout.tsx', RouterType.APP)).toBe(false);
    });
});
