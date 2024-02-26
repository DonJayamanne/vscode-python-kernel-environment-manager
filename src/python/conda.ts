import { CancellationTokenSource, NotebookCellOutputItem } from 'vscode';
import { traceError, traceVerbose, traceWarn } from '../logging';
import { getEnvironmentType, getJSONOutputFromPipCommand } from './utils';
import { Environment, RemoteEnvironment } from './types';
import { logExecutionErrors } from './jupyter';

const stdoutMime = NotebookCellOutputItem.stdout('').mime;
const stderrMime = NotebookCellOutputItem.stderr('').mime;

export type CondaPackageInfo = {
    base_url?: string;
    build_number?: number;
    build_string?: string;
    channel?: string;
    dist_name?: string;
    name: string;
    platform?: string;
    version: string;
};

type OutdatedPackageInfo = {
    actions?: {
        FETCH?: { version: string; name: string }[];
        LINK?: { version: string; name: string }[];
        UNLINK?: { version: string; name: string }[];
    };
};

// '-p', env.env.executable.sysPrefix!

const commandsRequiringPrefix = ['env', 'install', 'list', 'remove', 'uninstall', 'update', 'upgrade'];
const commandsRequiringYes = ['install', 'remove', 'uninstall', 'update', 'upgrade'];

function getCondaExecutor(env: RemoteEnvironment) {
    if (!isCondaEnvironment(env.env)) {
        return async (_args: string[], _options: { timeout: number }) => {
            return { stdout: '', stderr: '' };
        };
    }

    return async (args: string[], _options: { timeout: number }) => {
        const kernel = env.kernel.kernel.deref();
        if (!kernel || !(await env.kernel.isValid())) {
            throw new Error('Kernel is not Available');
        }
        const token = new CancellationTokenSource();
        if (commandsRequiringPrefix.includes(args[0])) {
            if (env.env.executable.sysPrefix) {
                args.push('--prefix', env.env.executable.sysPrefix.replaceAll('\\', '\\\\'));
            } else {
                traceWarn(`Conda environment does not have a sysPrefix`, env.env.id);
            }
        }
        if (commandsRequiringYes.includes(args[0])) {
            args.push('-y');
        }

        try {
            let stdout = '';
            let stderr = '';
            const code = `%conda ${args.join(' ')}`;
            for await (const output of kernel.executeCode(code, token.token)) {
                logExecutionErrors(`Failed to execute code ${code}`, output);
                for (const item of output.items) {
                    if (item.mime === stdoutMime) {
                        stdout += new TextDecoder().decode(item.data);
                    } else if (item.mime === stderrMime) {
                        stderr += new TextDecoder().decode(item.data);
                    } else {
                        let data = '';
                        try {
                            data = new TextDecoder().decode(item.data);
                        } catch {}
                        traceError(`Unexpected mime ${item.mime} when running pip command ${args.join(' ')}`, data);
                    }
                }
            }
            if (stderr.trim() && !stdout.trim()) {
                traceWarn(`Failed to execute conda command`, stderr);
            }
            traceVerbose(`%conda ${args.join(' ')}`);
            return { stdout, stderr };
        } catch (ex) {
            traceError(`Failed to execute pip command`, ex);
            return { stdout: '', stderr: `${ex}` };
        } finally {
            token.dispose();
        }
    };
}

export function isCondaEnvironment(env: Environment) {
    return getEnvironmentType(env) === 'Conda';
}

export async function getCondaPackages(env: RemoteEnvironment) {
    const result = await getCondaExecutor(env)(['list', '--json'], { timeout: 60_000 });
    const stdout = result.stdout.trim();
    const packages = getJSONOutputFromPipCommand<CondaPackageInfo[]>(stdout, []);
    return packages;
}
export async function getOutdatedCondaPackages(env: RemoteEnvironment): Promise<Map<string, string> | undefined> {
    const result = await getCondaExecutor(env)(['update', '--all', '-d', '--json'], { timeout: 60_000 });
    const stdout = result.stdout.trim();
    if (!stdout) {
        return;
    }
    const map = new Map<string, string>();
    const unlink = new Set<string>();
    const { actions } = getJSONOutputFromPipCommand<OutdatedPackageInfo>(result.stdout, {
        actions: { FETCH: [], LINK: [], UNLINK: [] },
    });
    if (actions) {
        (actions.UNLINK || []).forEach((pkg) => unlink.add(pkg.name));
        (actions.LINK || []).forEach((pkg) => {
            if (unlink.has(pkg.name)) {
                map.set(pkg.name, pkg.version);
            }
        });
    }

    return map;
}
export async function updateCondaPackages(env: RemoteEnvironment) {
    await getCondaExecutor(env)(['update', '--all'], { timeout: 60_000 });
}
export async function uninstallCondaPackage(env: RemoteEnvironment, pkg: CondaPackageInfo) {
    await getCondaExecutor(env)(['remove', pkg.name, '-y'], { timeout: 60_000 });
}
export async function installCondaPackage(env: RemoteEnvironment, pkg: CondaPackageInfo) {
    await getCondaExecutor(env)(['install', pkg.name], { timeout: 60_000 });
}
export async function updateCondaPackage(env: RemoteEnvironment, pkg: CondaPackageInfo) {
    await getCondaExecutor(env)(['update', pkg.name, '-y'], { timeout: 60_000 });
}

export async function exportCondaPackages(env: RemoteEnvironment) {
    const result = await getCondaExecutor(env)(['env', 'export'], {
        timeout: 60_000,
    });
    return { contents: result.stdout.trim(), language: 'yaml', file: 'environment.yml' };
}
