import * as path from '../utils/path';
import {
    CancellationTokenSource,
    EventEmitter,
    NotebookCellOutputItem,
    NotebookDocument,
    Uri,
    extensions,
    workspace,
} from 'vscode';
import { Jupyter, Kernel, Output } from '@vscode/jupyter-extension';
import { traceError, traceWarn } from '../logging';
import { Environment, KnownEnvironmentTools } from './types';

export async function getJupyterApi() {
    const jupyter = extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
    if (!jupyter) {
        traceWarn(`Jupyter extension not installed`);
        return;
    }
    if (!jupyter.isActive) {
        return jupyter.activate();
    }
    return jupyter.exports;
}

export class WrapperKernel {
    public readonly kernel: WeakRef<Kernel>;
    public readonly notebook: WeakRef<NotebookDocument>;
    public readonly notebookUri: Uri;
    constructor(kernel: Kernel, notebook: NotebookDocument) {
        this.kernel = new WeakRef(kernel);
        this.notebook = new WeakRef(notebook);
        this.notebookUri = notebook.uri;
    }

    async isValid() {
        const kernel = this.kernel.deref();
        if (!kernel) {
            return false;
        }
        const notebook = this.notebook.deref();
        if (!notebook) {
            return false;
        }
        const api = await getJupyterApi();
        if (!api) {
            return false;
        }
        const validKernel = await api.kernels.getKernel(notebook.uri);
        if (validKernel && validKernel === kernel) {
            return true;
        }
        return false;
    }
}

export async function getAllNotebooksWithKernels() {
    const notebooks: NotebookDocument[] = [];
    await Promise.all(
        workspace.notebookDocuments.map(async (doc) => {
            const jupyter = await getJupyterApi();
            if (!jupyter) {
                return;
            }
            const kernel = await jupyter.kernels.getKernel(doc.uri);
            if ((kernel?.language || '').toLowerCase() === 'python') {
                notebooks.push(doc);
            }
        }),
    );

    return notebooks;
}

export async function getKernelForNotebook(notebook: NotebookDocument) {
    const api = await getJupyterApi();
    return api?.kernels.getKernel(notebook.uri);
}

const OutputMimeType = 'application/vnd.custom.remote.environment.manager';

const codeToGetEnvironmentInfo = `
def __VSCODE_remote_env_info():
    import sys
    import os
    from IPython.display import display
    from pathlib import Path
    import sys

    data = {
        "home": os.path.expanduser("~"),
        "versionInfo": sys.version_info,
        "version": sys.version,
        "is64bit": sys.maxsize > 2147483647,
        "executable": sys.executable,
        "sysPrefix": sys.prefix,
        "isVenv": sys.prefix != sys.base_prefix,
        "isConda": Path(sys.prefix, "conda-meta", "history").exists(),
        "CONDA_PREFIX": os.environ.get("CONDA_PREFIX"),
        "CONDA_DEFAULT_ENV": os.environ.get("CONDA_DEFAULT_ENV"),
        "VIRTUAL_ENV": os.environ.get("VIRTUAL_ENV"),
    }
    display({"${OutputMimeType}": data}, raw=True)

__VSCODE_remote_env_info()
del __VSCODE_remote_env_info`;

type EnvironmentInfoFromKernel = {
    home: string;
    versionInfo: [number, number, number, string, number];
    version: string;
    is64bit: boolean;
    executable: string;
    sysPrefix: string;
    isVenv: boolean;
    isConda: boolean;
    CONDA_PREFIX: string | undefined | null;
    CONDA_DEFAULT_ENV: string | undefined | null;
    VIRTUAL_ENV: string | undefined | null;
};

export async function getRemoteEnvironmentInfo(kernel: Kernel): Promise<Environment | undefined> {
    const token = new CancellationTokenSource();
    let data = '';
    try {
        for await (const output of kernel.executeCode(codeToGetEnvironmentInfo, token.token)) {
            logExecutionErrors(`Failed to get environment info for the kernel`, output);
            const item = output.items.find((item) => item.mime === OutputMimeType);
            if (!item) {
                continue;
            }
            data = new TextDecoder().decode(item.data).trim();
            const json = JSON.parse(data.trim()) as EnvironmentInfoFromKernel;
            let version: Environment['version'] = undefined;
            if (json.versionInfo.length === 5) {
                version = {
                    major: json.versionInfo[0],
                    minor: json.versionInfo[1],
                    micro: json.versionInfo[2],
                    release: {
                        level: json.versionInfo[3] as any,
                        serial: json.versionInfo[4],
                    },
                    sysVersion: json.version,
                };
            }
            const tools: KnownEnvironmentTools[] = [];
            const knownTools: KnownEnvironmentTools[] = [];
            if (json.isConda || json.CONDA_PREFIX || json.CONDA_DEFAULT_ENV) {
                tools.push('Conda');
                knownTools.push('Conda');
            } else if (json.isVenv || json.VIRTUAL_ENV) {
                tools.push('Venv');
                knownTools.push('Venv');
            } else {
                knownTools.push('Unknown');
            }
            return {
                id: json.executable,
                home: Uri.file(json.home),
                path: json.executable,
                environment: {
                    folderUri: json.VIRTUAL_ENV ? Uri.file(json.VIRTUAL_ENV) : Uri.file(json.executable),
                    name: json.VIRTUAL_ENV
                        ? path.basename(json.VIRTUAL_ENV)
                        : json.CONDA_PREFIX
                        ? path.basename(json.CONDA_PREFIX)
                        : path.basename(json.executable),
                    type: knownTools[0],
                    workspaceFolder: undefined,
                },
                executable: {
                    bitness: json.is64bit ? '64-bit' : '32-bit',
                    sysPrefix: json.sysPrefix,
                    uri: Uri.file(json.executable),
                },
                tools: knownTools,
                version,
            };
        }
    } catch (ex) {
        traceError(`Failed to get environment info for the kernel, json received is ${data}`, ex);
    } finally {
        token.dispose();
    }
}
const knownKernels = new WeakSet<Kernel>();
const notebooksKnownToHaveKernels = new WeakSet<NotebookDocument>();
async function lookForNewKernels(notebook: NotebookDocument, foundNewKernel: () => void) {
    const kernel = await getKernelForNotebook(notebook);
    if (!kernel || knownKernels.has(kernel)) {
        return;
    }
    notebooksKnownToHaveKernels.add(notebook);
    knownKernels.add(kernel);
    foundNewKernel();
}

export function detectNewKernels() {
    // Work around, Jupyter API does not provide a way to detect when new Kernels are created/started.
    const eventEmitter = new EventEmitter<void>();
    const notebookChange = workspace.onDidChangeNotebookDocument(async (e) => {
        lookForNewKernels(e.notebook, eventEmitter.fire.bind(eventEmitter));
        // Starting kernels can be slow, so refresh after a delay.
        setTimeout(() => lookForNewKernels(e.notebook, eventEmitter.fire.bind(eventEmitter)), 5000);
    });
    const notebookClosed = workspace.onDidCloseNotebookDocument(async (e) => {
        if (notebooksKnownToHaveKernels.has(e)) {
            eventEmitter.fire();
        }
    });
    return {
        dispose: () => {
            notebookChange.dispose();
            notebookClosed.dispose();
            eventEmitter.dispose();
        },
        event: eventEmitter.event.bind(eventEmitter),
    };
}

const errorMime = NotebookCellOutputItem.error(new Error('')).mime;
export function logExecutionErrors(message: string, output: Output) {
    const errorItem = output.items.find((i) => i.mime === errorMime);
    if (!errorItem) {
        return;
    }
    const error = JSON.parse(new TextDecoder().decode(errorItem.data)) as Error;
    traceError(message, error);
}
