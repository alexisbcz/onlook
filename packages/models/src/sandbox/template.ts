export interface SandboxTemplate {
    id: string;
    port: number;
    /**
     * Templates that live in a git repository instead of a CodeSandbox template.
     * Sandboxes are created by cloning the repository.
     */
    git?: {
        repoUrl: string;
        branch: string;
    };
    framework?: ProjectFramework;
}

export type ProjectFramework = 'nextjs' | 'expo';
