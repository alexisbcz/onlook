/**
 * Local sandboxes run on the same machine as the Onlook server instead of CodeSandbox.
 * They are required to preview Expo apps on a phone (Expo Go over LAN) or a simulator,
 * and let you run Onlook end-to-end without a CodeSandbox account.
 */
export const LOCAL_SANDBOX_PREFIX = 'local-';

export function isLocalSandboxId(sandboxId: string | null | undefined): boolean {
    return !!sandboxId && sandboxId.startsWith(LOCAL_SANDBOX_PREFIX);
}

export function getLocalSandboxPreviewUrl(port: number, host = 'localhost') {
    return `http://${host}:${port}`;
}

export const LOCAL_SANDBOX_API_PATH = '/api/local-sandbox';
