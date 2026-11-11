import 'server-only';

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { BINARY_EXTENSIONS } from '@onlook/constants';

import { getLanAddress, getLocalSandbox, getSandboxEnv } from './manager';

const execFileAsync = promisify(execFile);

function isBinaryPath(filePath: string) {
    return BINARY_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

type Args = Record<string, unknown>;

const str = (args: Args, key: string): string => {
    const value = args[key];
    if (typeof value !== 'string') throw new Error(`Missing argument: ${key}`);
    return value;
};

/**
 * Executes one provider operation against a local sandbox. Every path is resolved inside the
 * sandbox directory; see `LocalSandbox.resolve`.
 */
export async function runLocalSandboxOperation(sandboxId: string, op: string, args: Args) {
    const sandbox = await getLocalSandbox(sandboxId);

    switch (op) {
        case 'info': {
            return { ...sandbox.meta, lanAddress: getLanAddress() };
        }
        case 'readFile': {
            const filePath = str(args, 'path');
            const abs = sandbox.resolve(filePath);
            if (isBinaryPath(filePath)) {
                const content = await fs.readFile(abs);
                return { type: 'binary', path: filePath, base64: content.toString('base64') };
            }
            return { type: 'text', path: filePath, content: await fs.readFile(abs, 'utf8') };
        }
        case 'writeFile': {
            const abs = sandbox.resolve(str(args, 'path'));
            if (args.overwrite === false && existsSync(abs)) return { success: false };
            await fs.mkdir(path.dirname(abs), { recursive: true });
            if (typeof args.base64 === 'string') {
                await fs.writeFile(abs, Buffer.from(args.base64, 'base64'));
            } else {
                await fs.writeFile(abs, str(args, 'content'));
            }
            return { success: true };
        }
        case 'statFile': {
            const stat = await fs.lstat(sandbox.resolve(str(args, 'path')));
            return {
                type: stat.isDirectory() ? 'directory' : 'file',
                isSymlink: stat.isSymbolicLink(),
                size: stat.size,
                mtime: stat.mtimeMs,
                ctime: stat.ctimeMs,
                atime: stat.atimeMs,
            };
        }
        case 'listFiles': {
            const entries = await fs.readdir(sandbox.resolve(str(args, 'path')), {
                withFileTypes: true,
            });
            return {
                files: entries.map((entry) => ({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    isSymlink: entry.isSymbolicLink(),
                })),
            };
        }
        case 'deleteFiles': {
            await fs.rm(sandbox.resolve(str(args, 'path')), {
                recursive: args.recursive === true,
                force: true,
            });
            return {};
        }
        case 'renameFile': {
            const target = sandbox.resolve(str(args, 'newPath'));
            await fs.mkdir(path.dirname(target), { recursive: true });
            await fs.rename(sandbox.resolve(str(args, 'oldPath')), target);
            return {};
        }
        case 'copyFiles': {
            await fs.cp(
                sandbox.resolve(str(args, 'sourcePath')),
                sandbox.resolve(str(args, 'targetPath')),
                {
                    recursive: args.recursive === true,
                    force: args.overwrite !== false,
                },
            );
            return {};
        }
        case 'createDirectory': {
            await fs.mkdir(sandbox.resolve(str(args, 'path')), { recursive: true });
            return {};
        }
        case 'runCommand': {
            try {
                const { stdout, stderr } = await execFileAsync(
                    getSandboxEnv().SHELL ?? '/bin/bash',
                    ['-lc', str(args, 'command')],
                    {
                        cwd: sandbox.dir,
                        env: getSandboxEnv(),
                        timeout: 120_000,
                        maxBuffer: 10 * 1024 * 1024,
                    },
                );
                return { output: stdout + stderr };
            } catch (error) {
                const e = error as { stdout?: string; stderr?: string; message: string };
                return { output: (e.stdout ?? '') + (e.stderr ?? '') || e.message };
            }
        }
        case 'gitStatus': {
            try {
                const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
                    cwd: sandbox.dir,
                });
                return {
                    changedFiles: stdout
                        .split('\n')
                        .filter(Boolean)
                        .map((line) => line.slice(3).trim()),
                };
            } catch {
                return { changedFiles: [] };
            }
        }
        case 'task.get': {
            const id = str(args, 'id');
            if (id !== 'dev') throw new Error(`Task ${id} not found`);
            const task = sandbox.getDevTask();
            return { id: task.id, name: task.name, command: task.command };
        }
        case 'process.output': {
            const id = str(args, 'id');
            const proc =
                id === 'dev' ? sandbox.getDevTask() : sandbox.processes.get(str(args, 'id'));
            return { output: proc?.output ?? '' };
        }
        case 'process.restart': {
            const id = str(args, 'id');
            const proc = id === 'dev' ? sandbox.getDevTask() : sandbox.processes.get(id);
            await proc?.restart();
            return {};
        }
        case 'process.stop': {
            await sandbox.processes.get(str(args, 'id'))?.stop();
            return {};
        }
        case 'process.write': {
            sandbox.processes.get(str(args, 'id'))?.write(str(args, 'input'));
            return {};
        }
        case 'terminal.create': {
            const proc = sandbox.createProcess('terminal', '');
            return { id: proc.id, name: proc.name };
        }
        case 'command.start': {
            const proc = sandbox.createProcess('command', str(args, 'command'));
            return { id: proc.id, name: proc.name, command: proc.command };
        }
        default:
            throw new Error(`Unknown local sandbox operation: ${op}`);
    }
}
