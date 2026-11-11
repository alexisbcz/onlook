import { LOCAL_SANDBOX_API_PATH } from '@onlook/constants';

import type {
    CopyFileOutput,
    CopyFilesInput,
    CreateDirectoryInput,
    CreateDirectoryOutput,
    CreateProjectInput,
    CreateProjectOutput,
    CreateSessionInput,
    CreateSessionOutput,
    CreateTerminalInput,
    CreateTerminalOutput,
    DeleteFilesInput,
    DeleteFilesOutput,
    DownloadFilesInput,
    DownloadFilesOutput,
    GetTaskInput,
    GetTaskOutput,
    GitStatusInput,
    GitStatusOutput,
    InitializeInput,
    InitializeOutput,
    ListFilesInput,
    ListFilesOutput,
    ListProjectsInput,
    ListProjectsOutput,
    PauseProjectInput,
    PauseProjectOutput,
    ReadFileInput,
    ReadFileOutput,
    RenameFileInput,
    RenameFileOutput,
    SetupInput,
    SetupOutput,
    StatFileInput,
    StatFileOutput,
    StopProjectInput,
    StopProjectOutput,
    TerminalBackgroundCommandInput,
    TerminalBackgroundCommandOutput,
    TerminalCommandInput,
    TerminalCommandOutput,
    WatchEvent,
    WatchFilesInput,
    WatchFilesOutput,
    WriteFileInput,
    WriteFileOutput,
} from '../../types';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '../../types';

/** Root that watch events are reported under, same as CodeSandbox. */
const SANDBOX_ROOT = '/project/sandbox';

export interface LocalProviderOptions {
    sandboxId: string;
    /** Origin of the Onlook server that owns the sandbox. Defaults to the current origin. */
    baseUrl?: string;
}

export interface LocalSandboxInfo {
    id: string;
    port: number;
    framework: 'nextjs' | 'expo';
    devCommand: string;
    lanAddress: string | null;
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Talks to a sandbox running on the Onlook server's machine through `/api/local-sandbox`.
 * File operations are plain JSON calls; process output and file changes stream over SSE.
 */
export class LocalProvider extends Provider {
    private readonly baseUrl: string;
    private readonly eventSources = new Set<EventSource>();

    constructor(readonly options: LocalProviderOptions) {
        super();
        this.baseUrl = options.baseUrl ?? '';
    }

    async call<T>(op: string, args: Record<string, unknown> = {}): Promise<T> {
        const res = await fetch(`${this.baseUrl}${LOCAL_SANDBOX_API_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ sandboxId: this.options.sandboxId, op, args }),
        });
        const json = (await res.json()) as T & { error?: string };
        if (!res.ok) {
            throw new Error(json.error ?? `Local sandbox ${op} failed (${res.status})`);
        }
        return json;
    }

    subscribe(params: Record<string, string>, onMessage: (data: unknown) => void): () => void {
        const query = new URLSearchParams({ sandboxId: this.options.sandboxId, ...params });
        const source = new EventSource(`${this.baseUrl}${LOCAL_SANDBOX_API_PATH}/events?${query}`, {
            withCredentials: true,
        });
        source.onmessage = (event: MessageEvent<string>) => onMessage(JSON.parse(event.data));
        this.eventSources.add(source);
        return () => {
            source.close();
            this.eventSources.delete(source);
        };
    }

    getInfo(): Promise<LocalSandboxInfo> {
        return this.call<LocalSandboxInfo>('info');
    }

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        await this.getInfo();
        return {};
    }

    async writeFile({ args }: WriteFileInput): Promise<WriteFileOutput> {
        const payload =
            args.content instanceof Uint8Array
                ? { base64: toBase64(args.content) }
                : { content: args.content };
        return this.call<WriteFileOutput>('writeFile', {
            path: args.path,
            overwrite: args.overwrite ?? true,
            ...payload,
        });
    }

    async renameFile({ args }: RenameFileInput): Promise<RenameFileOutput> {
        return this.call('renameFile', args);
    }

    async statFile({ args }: StatFileInput): Promise<StatFileOutput> {
        return this.call('statFile', args);
    }

    async deleteFiles({ args }: DeleteFilesInput): Promise<DeleteFilesOutput> {
        return this.call('deleteFiles', args);
    }

    async listFiles({ args }: ListFilesInput): Promise<ListFilesOutput> {
        return this.call('listFiles', args);
    }

    async readFile({ args }: ReadFileInput): Promise<ReadFileOutput> {
        const res = await this.call<
            | { type: 'text'; path: string; content: string }
            | { type: 'binary'; path: string; base64: string }
        >('readFile', args);
        if (res.type === 'text') {
            return {
                file: {
                    type: 'text',
                    path: res.path,
                    content: res.content,
                    toString: () => res.content,
                },
            };
        }
        return {
            file: {
                type: 'binary',
                path: res.path,
                content: fromBase64(res.base64),
                toString: () => res.base64,
            },
        };
    }

    async downloadFiles(_input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        return {};
    }

    async copyFiles({ args }: CopyFilesInput): Promise<CopyFileOutput> {
        return this.call('copyFiles', args);
    }

    async createDirectory({ args }: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        return this.call('createDirectory', args);
    }

    async watchFiles(input: WatchFilesInput): Promise<WatchFilesOutput> {
        const watcher = new LocalFileWatcher(this);
        await watcher.start(input);
        if (input.onFileChange) {
            watcher.registerEventCallback(async (event) => {
                await input.onFileChange?.(event);
            });
        }
        return { watcher };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        const { id, name } = await this.call<{ id: string; name: string }>('terminal.create');
        return { terminal: new LocalTerminal(this, id, name) };
    }

    async getTask({ args }: GetTaskInput): Promise<GetTaskOutput> {
        const task = await this.call<{ id: string; name: string; command: string }>(
            'task.get',
            args,
        );
        return { task: new LocalTask(this, task.id, task.name, task.command) };
    }

    async runCommand({ args }: TerminalCommandInput): Promise<TerminalCommandOutput> {
        return this.call('runCommand', args);
    }

    async runBackgroundCommand({
        args,
    }: TerminalBackgroundCommandInput): Promise<TerminalBackgroundCommandOutput> {
        const res = await this.call<{ id: string; name: string; command: string }>(
            'command.start',
            args,
        );
        return { command: new LocalBackgroundCommand(this, res.id, res.name, res.command) };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        return this.call('gitStatus');
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        return {};
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        return {};
    }

    async reload(): Promise<boolean> {
        await this.call('process.restart', { id: 'dev' });
        return true;
    }

    async reconnect(): Promise<void> {}

    async ping(): Promise<boolean> {
        try {
            await this.getInfo();
            return true;
        } catch {
            return false;
        }
    }

    static async createProject(_input: CreateProjectInput): Promise<CreateProjectOutput> {
        throw new Error('Local sandboxes are created by the Onlook server');
    }

    async pauseProject(_input: PauseProjectInput): Promise<PauseProjectOutput> {
        return {};
    }

    async stopProject(_input: StopProjectInput): Promise<StopProjectOutput> {
        return {};
    }

    async listProjects(_input: ListProjectsInput): Promise<ListProjectsOutput> {
        return {};
    }

    async destroy(): Promise<void> {
        for (const source of this.eventSources) source.close();
        this.eventSources.clear();
    }
}

export class LocalFileWatcher extends ProviderFileWatcher {
    private unsubscribe: (() => void) | null = null;
    private callbacks: Array<(event: WatchEvent) => Promise<void>> = [];
    private excludes: string[] = [];

    constructor(private readonly provider: LocalProvider) {
        super();
    }

    async start(input: WatchFilesInput): Promise<void> {
        this.excludes = (input.args.excludes ?? []).map((e) =>
            e.replace(/\*\*?\/?/g, '').replace(/\/$/, ''),
        );
        this.unsubscribe = this.provider.subscribe({ channel: 'watch' }, (data) => {
            const event = data as WatchEvent;
            const paths = event.paths.filter(
                (p) => !this.excludes.some((ex) => ex && p.split('/').includes(ex)),
            );
            if (paths.length === 0) return;
            // Match CodeSandbox's absolute paths, which the sync engine resolves against.
            const absolute = paths.map((p) => `${SANDBOX_ROOT}${p}`);
            for (const callback of this.callbacks)
                void callback({ type: event.type, paths: absolute });
        });
    }

    registerEventCallback(callback: (event: WatchEvent) => Promise<void>): void {
        this.callbacks.push(callback);
    }

    async stop(): Promise<void> {
        this.unsubscribe?.();
        this.unsubscribe = null;
        this.callbacks = [];
    }
}

/** Shared plumbing for anything backed by a server-side process. */
class ProcessStream {
    private listeners = new Set<(data: string) => void>();
    private unsubscribe: (() => void) | null = null;

    constructor(
        private readonly provider: LocalProvider,
        private readonly id: string,
    ) {}

    async open(): Promise<string> {
        if (!this.unsubscribe) {
            this.unsubscribe = this.provider.subscribe(
                { channel: 'process', id: this.id },
                (data) => {
                    const chunk = (data as { data: string }).data;
                    for (const listener of this.listeners) listener(chunk);
                },
            );
        }
        const { output } = await this.provider.call<{ output: string }>('process.output', {
            id: this.id,
        });
        return output;
    }

    onOutput(callback: (data: string) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    close() {
        this.unsubscribe?.();
        this.unsubscribe = null;
    }
}

export class LocalTerminal extends ProviderTerminal {
    private readonly stream: ProcessStream;

    constructor(
        private readonly provider: LocalProvider,
        private readonly _id: string,
        private readonly _name: string,
    ) {
        super();
        this.stream = new ProcessStream(provider, _id);
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    open(): Promise<string> {
        return this.stream.open();
    }

    async write(input: string): Promise<void> {
        await this.provider.call('process.write', { id: this._id, input });
    }

    async run(input: string): Promise<void> {
        await this.write(`${input}\n`);
    }

    async kill(): Promise<void> {
        this.stream.close();
        await this.provider.call('process.stop', { id: this._id });
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.stream.onOutput(callback);
    }
}

export class LocalTask extends ProviderTask {
    private readonly stream: ProcessStream;

    constructor(
        private readonly provider: LocalProvider,
        private readonly _id: string,
        private readonly _name: string,
        private readonly _command: string,
    ) {
        super();
        this.stream = new ProcessStream(provider, _id);
    }

    get id() {
        return this._id;
    }

    get name() {
        return this._name;
    }

    get command() {
        return this._command;
    }

    open(): Promise<string> {
        return this.stream.open();
    }

    async run(): Promise<void> {
        await this.provider.call('task.get', { id: this._id });
    }

    async restart(): Promise<void> {
        await this.provider.call('process.restart', { id: this._id });
    }

    async stop(): Promise<void> {
        await this.provider.call('process.stop', { id: this._id });
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.stream.onOutput(callback);
    }
}

export class LocalBackgroundCommand extends ProviderBackgroundCommand {
    private readonly stream: ProcessStream;

    constructor(
        private readonly provider: LocalProvider,
        private readonly id: string,
        private readonly _name: string,
        private readonly _command: string,
    ) {
        super();
        this.stream = new ProcessStream(provider, id);
    }

    get name() {
        return this._name;
    }

    get command() {
        return this._command;
    }

    open(): Promise<string> {
        return this.stream.open();
    }

    async restart(): Promise<void> {
        await this.provider.call('process.restart', { id: this.id });
    }

    async kill(): Promise<void> {
        this.stream.close();
        await this.provider.call('process.stop', { id: this.id });
    }

    onOutput(callback: (data: string) => void): () => void {
        return this.stream.onOutput(callback);
    }
}
