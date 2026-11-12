import superjson from 'superjson';

import { ONLOOK_URL } from './config';
import { supabase } from './supabase';

/**
 * Minimal client for Onlook's tRPC API (`/api/trpc`). Requests authenticate with the Supabase
 * access token as a bearer token; responses are superjson-encoded, like the web app's.
 */
async function call<T>(type: 'query' | 'mutation', path: string, input?: unknown): Promise<T> {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Not signed in');

    const encoded = superjson.serialize(input);
    const url =
        type === 'query'
            ? `${ONLOOK_URL}/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(encoded))}`
            : `${ONLOOK_URL}/api/trpc/${path}`;
    const res = await fetch(url, {
        method: type === 'query' ? 'GET' : 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-trpc-source': 'onlook-mobile',
        },
        body: type === 'mutation' ? JSON.stringify(encoded) : undefined,
    });
    const body = (await res.json()) as {
        result?: { data: Parameters<typeof superjson.deserialize>[0] };
        error?: { json?: { message?: string } };
    };
    if (!res.ok || !body.result) {
        throw new Error(body.error?.json?.message ?? `Request failed (${res.status})`);
    }
    return superjson.deserialize<T>(body.result.data);
}

export interface Project {
    id: string;
    name: string;
    metadata: {
        createdAt: Date;
        updatedAt: Date;
        description: string | null;
        tags: string[];
        previewImg: {
            type: 'storage' | 'url';
            url?: string;
            storagePath?: { bucket: string; path: string };
        } | null;
    };
}

/** Starters offered when creating a project, mirroring `SandboxTemplates` in @onlook/constants. */
export const TEMPLATES = {
    web: {
        id: 'pt_EphPmsurimGCQdiB44wa7s',
        port: 3000,
        framework: 'nextjs' as const,
        tags: ['blank'],
        description: 'Your new blank project',
    },
    mobile: {
        id: 'onlook-expo-template',
        port: 8081,
        framework: 'expo' as const,
        tags: ['mobile', 'expo'],
        description: 'A React Native app for iOS and Android, built with Expo',
    },
};

export type TemplateKey = keyof typeof TEMPLATES;

export const api = {
    listProjects: () => call<Project[]>('query', 'project.list'),

    async createProject(input: { userId: string; template: TemplateKey; name: string; prompt?: string }) {
        const template = TEMPLATES[input.template];
        const sandbox = await call<{ sandboxId: string; previewUrl: string }>('mutation', 'sandbox.fork', {
            sandbox: { id: template.id, port: template.port },
            config: { title: `${input.name} - ${input.userId}`, tags: [...template.tags, input.userId] },
        });
        const project = await call<Project>('mutation', 'project.create', {
            project: { name: input.name, description: template.description, tags: template.tags },
            userId: input.userId,
            sandboxId: sandbox.sandboxId,
            sandboxUrl: sandbox.previewUrl,
            framework: template.framework,
            creationData: input.prompt
                ? { context: [{ type: 'prompt', content: input.prompt }] }
                : undefined,
        });
        return project;
    },

    deleteProject: (id: string) => call<void>('mutation', 'project.delete', { id }),
};
