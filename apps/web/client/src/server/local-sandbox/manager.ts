import 'server-only';

import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, watch } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { ChildProcess } from 'node:child_process';
import type { FSWatcher } from 'node:fs';

import type { Templates } from '@onlook/constants';
import type { ProjectFramework } from '@onlook/models';
import { EXPO_TEMPLATE_DIR, LOCAL_SANDBOX_PREFIX, SandboxTemplates } from '@onlook/constants';

import { env } from '@/env';

const execFileAsync = promisify(execFile);

const MAX_BUFFER_CHARS = 200_000;
const WATCH_IGNORED = ['node_modules', '.git', '.next', '.expo', 'dist', 'web-build', '.onlook'];

export interface LocalSandboxMeta {
    id: string;
    port: number;
    framework: ProjectFramework;
    devCommand: string;
    createdAt: string;
}

export function getLocalSandboxRoot(): string {
    return env.ONLOOK_LOCAL_SANDBOX_DIR ?? path.join(os.homedir(), '.onlook', 'sandboxes');
}

export function isLocalSandboxEnabled(): boolean {
    return env.ONLOOK_LOCAL_SANDBOXES === 'true';
}

const INHERITED_ENV_KEYS = [
    'PATH',
    'HOME',
    'USER',
    'SHELL',
    'LANG',
    'LC_ALL',
    'TERM',
    'TMPDIR',
    'ANDROID_HOME',
    'JAVA_HOME',
    'DEVELOPER_DIR',
];

/**
 * Sandbox processes only see a minimal environment, never the Onlook server's secrets.
 */
// Reading the host environment is the point here, so `env` from '@/env' doesn't apply.
/* eslint-disable no-restricted-properties */
export function getSandboxEnv(): NodeJS.ProcessEnv {
    const sandboxEnv: NodeJS.ProcessEnv = { NODE_ENV: 'development', TERM: 'xterm-256color' };
    for (const key of INHERITED_ENV_KEYS) {
        const value = process.env[key];
        if (value) sandboxEnv[key] = value;
    }
    return sandboxEnv;
}
/* eslint-enable no-restricted-properties */

/**
 * A running process whose output is buffered (so late subscribers can replay it) and broadcast.
 */
class ManagedProcess extends EventEmitter {
    private child: ChildProcess | null = null;
    private buffer = '';

    constructor(
        readonly id: string,
        readonly name: string,
        readonly command: string,
        private readonly cwd: string,
        private readonly env: Record<string, string> = {},
        private readonly interactive = false,
    ) {
        super();
        this.setMaxListeners(50);
    }

    get output() {
        return this.buffer;
    }

    get running() {
        return !!this.child && this.child.exitCode === null && !this.child.killed;
    }

    start() {
        if (this.running) return;
        const shell = getSandboxEnv().SHELL ?? '/bin/bash';
        // `script` allocates a pseudo terminal so shells and dev servers print colors and prompts.
        const [file, args]: [string, string[]] = this.interactive
            ? process.platform === 'darwin'
                ? ['script', ['-q', '/dev/null', shell, '-i']]
                : ['script', ['-qfc', `${shell} -i`, '/dev/null']]
            : [shell, ['-lc', this.command]];
        const child = spawn(file, args, {
            cwd: this.cwd,
            env: { ...getSandboxEnv(), FORCE_COLOR: '1', ...this.env },
            detached: process.platform !== 'win32',
        });
        this.child = child;
        const onData = (chunk: Buffer) => this.append(chunk.toString('utf8'));
        child.stdout?.on('data', onData);
        child.stderr?.on('data', onData);
        child.on('exit', (code) => {
            this.append(`\r\n[process exited with code ${code ?? 'unknown'}]\r\n`);
            this.emit('exit', code);
        });
    }

    write(input: string) {
        this.child?.stdin?.write(input);
    }

    append(data: string) {
        this.buffer = (this.buffer + data).slice(-MAX_BUFFER_CHARS);
        this.emit('output', data);
    }

    async stop() {
        const child = this.child;
        if (child?.exitCode !== null) return;
        await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 3000);
            child.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
            try {
                // Kill the whole process group so dev servers don't linger.
                if (child.pid) process.kill(-child.pid, 'SIGTERM');
            } catch {
                child.kill('SIGTERM');
            }
        });
        this.child = null;
    }

    async restart() {
        await this.stop();
        this.buffer = '';
        this.start();
    }
}

/**
 * Per-sandbox state: the dev server task, terminals, background commands and a file watcher.
 */
class LocalSandbox extends EventEmitter {
    readonly processes = new Map<string, ManagedProcess>();
    private watcher: FSWatcher | null = null;
    private watchSubscribers = 0;

    constructor(
        readonly meta: LocalSandboxMeta,
        readonly dir: string,
    ) {
        super();
        this.setMaxListeners(100);
    }

    resolve(relativePath: string): string {
        const cleaned = relativePath.replace(/^\.?\/+/, '');
        const resolved = path.resolve(this.dir, cleaned);
        if (resolved !== this.dir && !resolved.startsWith(this.dir + path.sep)) {
            throw new Error(`Path escapes sandbox: ${relativePath}`);
        }
        return resolved;
    }

    getDevTask(): ManagedProcess {
        let task = this.processes.get('dev');
        if (!task) {
            task = new ManagedProcess('dev', 'dev', this.meta.devCommand, this.dir, {
                PORT: String(this.meta.port),
                BROWSER: 'none',
                EXPO_NO_TELEMETRY: '1',
            });
            this.processes.set('dev', task);
        }
        if (!task.running) task.start();
        return task;
    }

    createProcess(kind: 'terminal' | 'command', command: string): ManagedProcess {
        const id = `${kind}-${Math.random().toString(36).slice(2, 10)}`;
        const proc = new ManagedProcess(id, kind, command, this.dir, {}, kind === 'terminal');
        this.processes.set(id, proc);
        proc.start();
        return proc;
    }

    subscribeToWatch(listener: (event: { type: string; paths: string[] }) => void): () => void {
        this.on('watch', listener);
        this.watchSubscribers++;
        if (!this.watcher) {
            this.watcher = watch(this.dir, { recursive: true }, (_event, filename) => {
                if (!filename) return;
                const rel = filename.toString().split(path.sep).join('/');
                if (rel.split('/').some((segment) => WATCH_IGNORED.includes(segment))) return;
                const type = existsSync(path.join(this.dir, rel)) ? 'change' : 'remove';
                this.emit('watch', { type, paths: [`/${rel}`] });
            });
        }
        return () => {
            this.off('watch', listener);
            this.watchSubscribers--;
            if (this.watchSubscribers <= 0) {
                this.watcher?.close();
                this.watcher = null;
                this.watchSubscribers = 0;
            }
        };
    }

    async dispose() {
        this.watcher?.close();
        await Promise.all([...this.processes.values()].map((p) => p.stop()));
        this.processes.clear();
    }
}

type Registry = Map<string, LocalSandbox>;
const globalForSandboxes = globalThis as unknown as { __onlookLocalSandboxes?: Registry };
const registry: Registry = (globalForSandboxes.__onlookLocalSandboxes ??= new Map<
    string,
    LocalSandbox
>());

function assertValidId(sandboxId: string) {
    if (!/^local-[a-z0-9-]+$/.test(sandboxId)) {
        throw new Error(`Invalid local sandbox id: ${sandboxId}`);
    }
}

export async function getLocalSandbox(sandboxId: string): Promise<LocalSandbox> {
    assertValidId(sandboxId);
    const existing = registry.get(sandboxId);
    if (existing) return existing;
    const dir = path.join(getLocalSandboxRoot(), sandboxId);
    const metaPath = path.join(dir, '.onlook', 'sandbox.json');
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as LocalSandboxMeta;
    const sandbox = new LocalSandbox(meta, dir);
    registry.set(sandboxId, sandbox);
    return sandbox;
}

async function findFreePort(start: number): Promise<number> {
    const used = new Set<number>();
    for (const sandbox of registry.values()) used.add(sandbox.meta.port);
    const root = getLocalSandboxRoot();
    if (existsSync(root)) {
        for (const entry of await fs.readdir(root)) {
            try {
                const meta = JSON.parse(
                    await fs.readFile(path.join(root, entry, '.onlook', 'sandbox.json'), 'utf8'),
                ) as LocalSandboxMeta;
                used.add(meta.port);
            } catch {
                // not a sandbox
            }
        }
    }
    for (let port = start; port < start + 500; port++) {
        if (used.has(port)) continue;
        const free = await new Promise<boolean>((resolve) => {
            const server = net.createServer();
            server.once('error', () => resolve(false));
            server.listen(port, () => server.close(() => resolve(true)));
        });
        if (free) return port;
    }
    throw new Error('No free port available for local sandbox');
}

async function detectFramework(dir: string): Promise<ProjectFramework> {
    try {
        const pkg = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8')) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.expo || deps['react-native']) return 'expo';
    } catch {
        // fall through
    }
    return 'nextjs';
}

function getDevCommand(framework: ProjectFramework, port: number): string {
    if (framework === 'expo') {
        // --lan makes the bundle reachable from Expo Go on a phone on the same network.
        return `bun install && bunx expo start --web --lan --port ${port}`;
    }
    return `bun install && bun run dev -- --port ${port}`;
}

/** Finds `templates/<name>` in the Onlook checkout the server runs from, if present. */
function findLocalTemplateDir(relativeDir: string): string | null {
    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
        const candidate = path.join(dir, relativeDir);
        if (existsSync(path.join(candidate, 'package.json'))) return candidate;
        dir = path.dirname(dir);
    }
    return null;
}

/**
 * Creates a local sandbox from a template (cloned from git) or an arbitrary repository.
 */
export async function createLocalSandbox(input: {
    template?: Templates;
    repoUrl?: string;
    branch?: string;
}): Promise<{ sandboxId: string; port: number; framework: ProjectFramework }> {
    const template = input.template ? SandboxTemplates[input.template] : undefined;
    const repoUrl = input.repoUrl ?? template?.git?.repoUrl;
    const branch = input.branch ?? template?.git?.branch;
    if (!repoUrl) {
        throw new Error(
            'Local sandboxes are created from git. Use the mobile (Expo) template or import a GitHub repository.',
        );
    }
    if (!/^https:\/\/[\w.-]+\/[\w./-]+$/.test(repoUrl)) {
        throw new Error(`Unsupported repository URL: ${repoUrl}`);
    }

    const sandboxId = `${LOCAL_SANDBOX_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const root = getLocalSandboxRoot();
    const dir = path.join(root, sandboxId);
    await fs.mkdir(root, { recursive: true });

    const templateDir =
        template?.framework === 'expo' ? findLocalTemplateDir(EXPO_TEMPLATE_DIR) : null;
    if (templateDir) {
        // Copy the template from this Onlook checkout (works offline).
        await fs.cp(templateDir, dir, {
            recursive: true,
            filter: (src) =>
                !src.includes(`${path.sep}node_modules`) && !src.endsWith(`${path.sep}.git`),
        });
        await execFileAsync('git', ['init', '-q'], { cwd: dir });
        await execFileAsync('git', ['add', '-A'], { cwd: dir });
        await execFileAsync(
            'git',
            [
                '-c',
                'user.name=Onlook',
                '-c',
                'user.email=onlook@localhost',
                'commit',
                '-qm',
                'Initial commit',
            ],
            { cwd: dir },
        );
    } else {
        const args = ['clone', '--depth', '1'];
        if (branch) args.push('--branch', branch);
        await execFileAsync('git', [...args, repoUrl, dir], { timeout: 120_000 });
    }

    const framework = template?.framework ?? (await detectFramework(dir));
    const port = await findFreePort(framework === 'expo' ? 8081 : 3100);
    const meta: LocalSandboxMeta = {
        id: sandboxId,
        port,
        framework,
        devCommand: getDevCommand(framework, port),
        createdAt: new Date().toISOString(),
    };
    await fs.mkdir(path.join(dir, '.onlook'), { recursive: true });
    await fs.writeFile(path.join(dir, '.onlook', 'sandbox.json'), JSON.stringify(meta, null, 2));

    const sandbox = await getLocalSandbox(sandboxId);
    sandbox.getDevTask();
    return { sandboxId, port, framework };
}

export async function deleteLocalSandbox(sandboxId: string) {
    const sandbox = await getLocalSandbox(sandboxId);
    await sandbox.dispose();
    registry.delete(sandboxId);
}

export async function stopLocalSandbox(sandboxId: string) {
    const sandbox = registry.get(sandboxId);
    if (!sandbox) return;
    await sandbox.dispose();
    registry.delete(sandboxId);
}

/** First non-internal IPv4 address, used to build Expo Go URLs for phones on the LAN. */
export function getLanAddress(): string | null {
    for (const addresses of Object.values(os.networkInterfaces())) {
        for (const address of addresses ?? []) {
            if (address.family === 'IPv4' && !address.internal) return address.address;
        }
    }
    return null;
}
