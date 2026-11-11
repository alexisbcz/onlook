import type { Provider } from '@onlook/code-provider';
import {
    NEXT_JS_FILE_EXTENSIONS,
    ONLOOK_DEV_PRELOAD_SCRIPT_PATH,
    ONLOOK_DEV_PRELOAD_SCRIPT_SRC,
    ONLOOK_PRELOAD_SCRIPT_SRC,
} from '@onlook/constants';
import { RouterType, type RouterConfig } from '@onlook/models';
import {
    addOnlookBabelPlugin,
    DEFAULT_EXPO_BABEL_CONFIG,
    getAstFromContent,
    getContentFromAst,
    getExpoPreloadModule,
    injectExpoPreloadImport,
    injectPreloadScript,
    ONLOOK_BABEL_PLUGIN_SOURCE,
    ONLOOK_NATIVE_BABEL_PLUGIN_FILE,
    ONLOOK_NATIVE_PRELOAD_FILE,
} from '@onlook/parser';
import { isRootLayoutFile, normalizePath } from '@onlook/utility';
import path from 'path';

export async function copyPreloadScriptToPublic(provider: Provider, routerConfig: RouterConfig): Promise<void> {
    try {
        try {
            await provider.createDirectory({ args: { path: 'public' } });
        } catch {
            // Directory might already exist, ignore error
        }

        const scriptResponse = await fetch(ONLOOK_DEV_PRELOAD_SCRIPT_SRC);
        await provider.writeFile({
            args: {
                path: ONLOOK_DEV_PRELOAD_SCRIPT_PATH,
                content: await scriptResponse.text(),
                overwrite: true
            }
        });

        if (routerConfig.type === RouterType.EXPO) {
            await setupExpoBridge(provider);
        }

        await injectPreloadScriptIntoLayout(provider, routerConfig);
    } catch (error) {
        console.error('[PreloadScript] Failed to copy preload script:', error);
    }
}

export async function injectPreloadScriptIntoLayout(provider: Provider, routerConfig: RouterConfig): Promise<void> {
    if (!routerConfig) {
        throw new Error('Could not detect router type for script injection. This is required for iframe communication.');
    }

    const result = await provider.listFiles({ args: { path: routerConfig.basePath } });
    const [layoutFile] = result.files.filter(file =>
        file.type === 'file' && isRootLayoutFile(`${routerConfig.basePath}/${file.name}`, routerConfig.type)
    );

    if (!layoutFile) {
        throw new Error(`No layout files found in ${routerConfig.basePath}`);
    }

    const layoutPath = `${routerConfig.basePath}/${layoutFile.name}`;

    const layoutResponse = await provider.readFile({ args: { path: layoutPath } });
    if (typeof layoutResponse.file.content !== 'string') {
        throw new Error(`Layout file ${layoutPath} is not a text file`);
    }

    const content = layoutResponse.file.content;
    const ast = getAstFromContent(content);
    if (!ast) {
        throw new Error(`Failed to parse layout file: ${layoutPath}`);
    }

    if (routerConfig.type === RouterType.EXPO) {
        injectExpoPreloadImport(ast, layoutPath);
    } else {
        injectPreloadScript(ast);
    }
    const modifiedContent = await getContentFromAst(ast, content);
    if (modifiedContent === content) {
        // Avoid needless writes: they trigger a rebuild while the preview is loading.
        return;
    }

    await provider.writeFile({
        args: {
            path: layoutPath,
            content: modifiedContent,
            overwrite: true
        }
    });
}

export async function getLayoutPath(routerConfig: RouterConfig, fileExists: (path: string) => Promise<boolean>): Promise<string | null> {
    if (!routerConfig) {
        console.log('Could not detect Next.js router type');
        return null;
    }

    let layoutFileName: string;

    if (routerConfig.type === RouterType.PAGES) {
        layoutFileName = '_app';
    } else if (routerConfig.type === RouterType.EXPO) {
        layoutFileName = '_layout';
    } else {
        layoutFileName = 'layout';
    }

    for (const extension of NEXT_JS_FILE_EXTENSIONS) {
        const layoutPath = path.join(routerConfig.basePath, `${layoutFileName}${extension}`);
        if (await fileExists(layoutPath)) {
            return normalizePath(layoutPath);
        }
    }

    console.log('Could not find layout file');
    return null;
}
/** Writes a file only if its content changed, so the dev server doesn't rebuild for nothing. */
async function writeIfChanged(provider: Provider, path: string, content: string): Promise<void> {
    try {
        const { file } = await provider.readFile({ args: { path } });
        if (file.type === 'text' && file.content === content) return;
    } catch {
        // File doesn't exist yet
    }
    await provider.writeFile({ args: { path, content, overwrite: true } });
}

async function fileExists(provider: Provider, filePath: string): Promise<boolean> {
    try {
        await provider.statFile({ args: { path: filePath } });
        return true;
    } catch {
        return false;
    }
}

/**
 * React Native (Expo) projects need two bridge files so Onlook can edit them visually:
 * - `onlook/preload.js` loads the preload script in the web preview (imported by `_layout`)
 * - `onlook/babel-plugin-react-native.js` keeps `data-oid` attributes through react-native-web
 */
export async function setupExpoBridge(provider: Provider): Promise<void> {
    try {
        await provider.createDirectory({ args: { path: 'onlook' } });
    } catch {
        // Directory might already exist
    }

    await writeIfChanged(
        provider,
        ONLOOK_NATIVE_PRELOAD_FILE,
        getExpoPreloadModule(ONLOOK_PRELOAD_SCRIPT_SRC),
    );
    await writeIfChanged(provider, ONLOOK_NATIVE_BABEL_PLUGIN_FILE, ONLOOK_BABEL_PLUGIN_SOURCE);

    if (!(await fileExists(provider, 'babel.config.js'))) {
        await provider.writeFile({
            args: { path: 'babel.config.js', content: DEFAULT_EXPO_BABEL_CONFIG, overwrite: false },
        });
        return;
    }

    const { file } = await provider.readFile({ args: { path: 'babel.config.js' } });
    if (typeof file.content !== 'string') return;
    const updated = addOnlookBabelPlugin(file.content);
    if (updated) {
        await provider.writeFile({
            args: { path: 'babel.config.js', content: updated, overwrite: true },
        });
    }
}
