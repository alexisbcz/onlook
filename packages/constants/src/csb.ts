import type { SandboxTemplate } from '@onlook/models';

export enum Templates {
    BLANK = 'BLANK',
    EMPTY_NEXTJS = 'EMPTY_NEXTJS',
    EXPO_MOBILE = 'EXPO_MOBILE',
}

// The Expo template lives in `templates/expo/` and is published to the `template-expo`
// branch (git subtree split) so CodeSandbox can clone it as a standalone repository.
export const EXPO_TEMPLATE_REPO_URL = 'https://github.com/alexisbcz/onlook';
export const EXPO_TEMPLATE_BRANCH = 'template-expo';
export const EXPO_TEMPLATE_DIR = 'templates/expo';
export const EXPO_DEV_SERVER_PORT = 8081;

export const SandboxTemplates: Record<Templates, SandboxTemplate> = {
    BLANK: {
        id: 'xzsy8c',
        port: 3000,
    },
    EMPTY_NEXTJS: {
        id: 'pt_EphPmsurimGCQdiB44wa7s',
        port: 3000,
    },
    EXPO_MOBILE: {
        id: 'onlook-expo-template',
        port: EXPO_DEV_SERVER_PORT,
        git: {
            repoUrl: EXPO_TEMPLATE_REPO_URL,
            branch: EXPO_TEMPLATE_BRANCH,
        },
        framework: 'expo',
    },
};

export const CSB_PREVIEW_TASK_NAME = 'dev';
export const CSB_DOMAIN = 'csb.app';

export function getSandboxPreviewUrl(sandboxId: string, port: number) {
    return `https://${sandboxId}-${port}.${CSB_DOMAIN}`;
}
