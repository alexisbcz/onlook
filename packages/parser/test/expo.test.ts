import { transform } from '@babel/standalone';
import { describe, expect, test } from 'bun:test';
import {
    addOnlookBabelPlugin,
    getAstFromContent,
    getContentFromAst,
    getExpoPreloadImportPath,
    getExpoPreloadModule,
    injectExpoPreloadImport,
    ONLOOK_BABEL_PLUGIN_SOURCE,
} from 'src';

function loadBabelPlugin() {
    const module = { exports: {} as unknown };
    new Function('module', 'exports', ONLOOK_BABEL_PLUGIN_SOURCE)(module, module.exports);
    return module.exports as (api: unknown) => unknown;
}

function compile(code: string): string {
    return (
        transform(code, {
            filename: 'screen.tsx',
            presets: ['typescript'],
            plugins: [loadBabelPlugin()],
            parserOpts: { plugins: ['jsx', 'typescript'] },
        }).code ?? ''
    );
}

describe('Expo preload import', () => {
    test('import path is relative to the root layout', () => {
        expect(getExpoPreloadImportPath('src/app/_layout.tsx')).toBe('../../onlook/preload');
        expect(getExpoPreloadImportPath('app/_layout.tsx')).toBe('../onlook/preload');
        expect(getExpoPreloadImportPath('/app/_layout.tsx')).toBe('../onlook/preload');
    });

    test('adds the import once, at the top of the layout', async () => {
        const input = `import { Stack } from 'expo-router';

export default function RootLayout() {
    return <Stack />;
}
`;
        const ast = getAstFromContent(input)!;
        injectExpoPreloadImport(ast, 'src/app/_layout.tsx');
        injectExpoPreloadImport(ast, 'src/app/_layout.tsx');
        const output = await getContentFromAst(ast, input);
        expect(output.match(/onlook\/preload/g)?.length).toBe(1);
        expect(output.trimStart().startsWith(`import "../../onlook/preload";`)).toBe(true);
    });

    test('replaces an import with a stale path', async () => {
        const input = `import '../onlook/preload';
export default function RootLayout() {
    return null;
}
`;
        const ast = getAstFromContent(input)!;
        injectExpoPreloadImport(ast, 'src/app/_layout.tsx');
        const output = await getContentFromAst(ast, input);
        expect(output).toContain('../../onlook/preload');
        expect(output).not.toContain(`'../onlook/preload'`);
    });

    test('preload module only runs on web inside an iframe', () => {
        const module = getExpoPreloadModule('/onlook-preload-script.js');
        expect(module).toContain(`typeof document !== 'undefined'`);
        expect(module).toContain('window.self !== window.top');
        expect(module).toContain('"/onlook-preload-script.js"');
    });
});

describe('babel config', () => {
    test('adds the plugin to an existing plugins array', () => {
        const input = `module.exports = function (api) {
    api.cache(true);
    return { presets: ['babel-preset-expo'], plugins: ['react-native-reanimated/plugin'] };
};`;
        expect(addOnlookBabelPlugin(input)).toContain(
            `plugins: ['./onlook/babel-plugin-react-native.js', 'react-native-reanimated/plugin']`,
        );
    });

    test('adds a plugins array next to presets', () => {
        const input = `module.exports = function (api) {
    api.cache(true);
    return {
        presets: ['babel-preset-expo'],
    };
};`;
        expect(addOnlookBabelPlugin(input)).toContain(
            `plugins: ['./onlook/babel-plugin-react-native.js'],`,
        );
    });

    test('leaves configs that already use the plugin alone', () => {
        expect(
            addOnlookBabelPlugin(`plugins: ['./onlook/babel-plugin-react-native.js']`),
        ).toBeNull();
    });
});

describe('react-native babel plugin', () => {
    test('moves data-* props on components into dataSet', () => {
        const output = compile(`<View data-oid="abc" data-onlook-ignore className="flex-1" />`);
        expect(output).toContain('dataSet={{');
        expect(output).toContain('"oid": "abc"');
        expect(output).toContain('"onlookIgnore": true');
        expect(output).not.toContain('data-oid');
    });

    test('merges into an existing dataSet', () => {
        const output = compile(`<Text dataSet={{ testid: 'title' }} data-oid="t1">Hi</Text>`);
        expect(output).toContain(`testid: 'title'`);
        expect(output).toContain('"oid": "t1"');
        expect(output.match(/dataSet/g)?.length).toBe(1);
    });

    test('keeps data-* on host DOM elements', () => {
        expect(compile(`<div data-oid="d1" />`)).toContain('<div data-oid="d1" />');
    });
});
