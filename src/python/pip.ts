/* eslint-disable camelcase */

import { CancellationTokenSource, NotebookCellOutputItem } from 'vscode';
import { traceError, traceVerbose, traceWarn } from '../logging';
import { RemoteEnvironment } from './types';
import { logExecutionErrors } from './jupyter';
import { getJSONOutputFromPipCommand } from './utils';

const stdoutMime = NotebookCellOutputItem.stdout('').mime;
const stderrMime = NotebookCellOutputItem.stderr('').mime;

export interface PipPackageInfo {
    name: string;
    version: string;
}
export interface OutdatedPipPackageInfo extends PipPackageInfo {
    latest_version: string;
}

function getPipExecutor(env: RemoteEnvironment) {
    return async (args: string[], _options: { timeout: number }) => {
        const kernel = env.kernel.kernel.deref();
        if (!kernel || !(await env.kernel.isValid())) {
            throw new Error('Kernel is not Available');
        }
        const token = new CancellationTokenSource();
        try {
            let stdout = '';
            let stderr = '';
            const code = `%pip ${args.join(' ')}`;
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
            traceVerbose(`!pip ${args.join(' ')}`);
            return { stdout, stderr };
        } catch (ex) {
            traceError(`Failed to execute pip command`, ex);
            return { stdout: '', stderr: `${ex}` };
        } finally {
            token.dispose();
        }
    };
}

export async function getPipPackages(env: RemoteEnvironment) {
    const result = await getPipExecutor(env)(['list', '--format', 'json'], { timeout: 60_000 });
    return getJSONOutputFromPipCommand<PipPackageInfo[]>(result.stdout, []);
}
export async function getOutdatedPipPackages(env: RemoteEnvironment): Promise<Map<string, string>> {
    const result = await getPipExecutor(env)(['list', '--outdated', '--format', 'json'], { timeout: 60_000 });
    const packages = getJSONOutputFromPipCommand<OutdatedPipPackageInfo[]>(result.stdout, []);
    const map = new Map<string, string>();
    packages.forEach((pkg) => map.set(pkg.name, pkg.latest_version));
    return map;
}
export async function updatePipPackage(env: RemoteEnvironment, pkg: PipPackageInfo) {
    await getPipExecutor(env)(['install', '-U', pkg.name], { timeout: 60_000 });
}
export async function updatePipPackages(env: RemoteEnvironment) {
    const outdatedPackages = await getOutdatedPipPackages(env);
    const packages = Array.from(outdatedPackages.keys());
    if (packages.length === 0) {
        traceError(`No outdated packages found for ${env.env.id}`);
    }
    await getPipExecutor(env)(['install', '-U', ...packages], { timeout: 60_000 });
}
export async function uninstallPipPackage(env: RemoteEnvironment, pkg: PipPackageInfo) {
    await getPipExecutor(env)(['uninstall', '-y', pkg.name], { timeout: 60_000 });
}
export async function installPipPackage(env: RemoteEnvironment, pkg: PipPackageInfo) {
    await getPipExecutor(env)(['install', pkg.name], { timeout: 60_000 });
}
export async function exportPipPackages(env: RemoteEnvironment) {
    const result = await getPipExecutor(env)(['freeze'], { timeout: 60_000 });
    return { contents: result.stdout.trim(), language: 'pip-requirements', file: 'requirements.txt' };
}
