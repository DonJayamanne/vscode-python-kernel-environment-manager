import * as path from '../utils/path';
import {
    Disposable,
    EventEmitter,
    NotebookDocument,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Uri,
    commands,
    l10n,
    window,
    workspace,
} from 'vscode';
import { Package, PythonEnvironmentTreeNode, RemoteEnvironmentWrapper, RemotePackageWrapper } from './types';
import { PythonEnvironmentTreeDataProvider } from './envTreeDataProvider';
import {
    WrapperKernel,
    getAllNotebooksWithKernels,
    getKernelForNotebook,
    getRemoteEnvironmentInfo,
} from '../python/jupyter';
import { noop } from '../utils/misc';
import { exportPackages, uninstallPackage, updatePackage, updatePackages } from '../python/packages';
import { traceError } from '../logging';

export type TreeNode = NotebookDocument | PythonEnvironmentTreeNode;

function isNotebookDocument(node: TreeNode): node is NotebookDocument {
    return 'uri' in node && 'notebookType' in node && typeof node.notebookType === 'string';
}
export class RemoteKernelsTreeDataProvider implements TreeDataProvider<TreeNode> {
    private readonly _changeTreeData = new EventEmitter<TreeNode | void | undefined | null>();
    public readonly onDidChangeTreeData = this._changeTreeData.event;
    private readonly envTreeDataProvider: PythonEnvironmentTreeDataProvider;
    private readonly disposables: Disposable[] = [];
    public static instance: RemoteKernelsTreeDataProvider;
    private refreshing = false;
    constructor() {
        RemoteKernelsTreeDataProvider.instance = this;
        this.envTreeDataProvider = new PythonEnvironmentTreeDataProvider();
        this.disposables.push(
            this.envTreeDataProvider,
            this.envTreeDataProvider.onDidChangeTreeData((e) => this._changeTreeData.fire(e)),
            commands.registerCommand('python.remoteEnvManager.refreshPackages', (pkg: RemotePackageWrapper) =>
                this._changeTreeData.fire(pkg),
            ),
            commands.registerCommand('python.remoteEnvManager.refreshOutdatedPackages', (pkg: RemotePackageWrapper) =>
                this.envTreeDataProvider.showOutdatedPackages(pkg.env),
            ),
            commands.registerCommand('python.remoteEnvManager.refresh', () => this.refresh()),
            commands.registerCommand('python.remoteEnvManager.updateAllPackages', async (pkg: RemotePackageWrapper) => {
                const yes = await window.showWarningMessage(
                    l10n.t(`Are you sure you want to update all the packages?`),
                    { modal: true },
                    l10n.t('Yes'),
                    l10n.t('No'),
                );
                if (yes !== l10n.t('Yes')) {
                    return;
                }

                pkg.packages.forEach((e) => {
                    e.status = 'UpdatingToLatest';
                    this._changeTreeData.fire(e);
                });

                await updatePackages(pkg.env);

                // Other packages may have been uninstalled, so refresh all packages.
                this._changeTreeData.fire(pkg);
            }),
            commands.registerCommand(
                'python.remoteEnvManager.exportEnvironment',
                async (env: RemoteEnvironmentWrapper) => {
                    const result = await exportPackages(env);
                    if (!result) {
                        return;
                    }
                    const language = result.file.endsWith('.yml') ? 'yaml' : 'pip-requirements';
                    const doc = await workspace.openTextDocument({ language, content: result.contents });
                    await window.showTextDocument(doc);
                },
            ),
            commands.registerCommand('python.remoteEnvManager.updatePackage', async (pkg: Package) => {
                const yes = await window.showWarningMessage(
                    l10n.t(
                        "Are you sure you want to update the package '{0} to the latest version {1}?",
                        pkg.pkg.name,
                        pkg.latestVersion || '',
                    ),
                    { modal: true },
                    l10n.t('Yes'),
                    l10n.t('No'),
                );
                if (yes !== l10n.t('Yes')) {
                    return;
                }

                pkg.status = 'DetectingLatestVersion';
                this._changeTreeData.fire(pkg);

                await updatePackage(pkg.env, pkg.pkg).catch((ex) =>
                    traceError(`Failed to update package ${pkg.pkg.name} in ${pkg.env}`, ex),
                );
                pkg.status = undefined;

                // Other packages may have been updated, so refresh all packages.
                this._changeTreeData.fire(pkg.parent);
            }),
            commands.registerCommand('python.remoteEnvManager.uninstallPackage', async (pkg: Package) => {
                const yes = await window.showWarningMessage(
                    l10n.t("Are you sure you want to uninstall the package '{0}'?", pkg.pkg.name),
                    { modal: true },
                    l10n.t('Yes'),
                    l10n.t('No'),
                );
                if (yes !== l10n.t('Yes')) {
                    return;
                }

                pkg.status = 'UnInstalling';
                this._changeTreeData.fire(pkg);
                await uninstallPackage(pkg.env, pkg.pkg);
                pkg.status = undefined;

                // Other packages may have been uninstalled, so refresh all packages.
                this._changeTreeData.fire(pkg.parent);
            }),
        );
    }
    public async refresh() {
        if (this.refreshing) {
            return;
        }
        this.refreshing = true;
        commands.executeCommand('setContext', 'isRefreshingKernels', true);
        try {
            this._changeTreeData.fire(undefined);
        } finally {
            this.refreshing = false;
            commands.executeCommand('setContext', 'isRefreshingKernels', false).then(noop, noop);
        }
    }
    public dispose() {
        this.disposables.forEach((d) => d.dispose());
    }
    async getTreeItem(element: TreeNode): Promise<TreeItem> {
        if (isNotebookDocument(element)) {
            const tree = new TreeItem(path.basename(element.uri), TreeItemCollapsibleState.Collapsed);
            tree.iconPath = ThemeIcon.File;
            tree.resourceUri = Uri.file('one.ipynb');
            return tree;
        }
        return this.envTreeDataProvider!.getTreeItem(element);
    }
    async getChildren(element?: TreeNode | undefined): Promise<TreeNode[]> {
        if (!element) {
            if (workspace.notebookDocuments.length === 0) {
                return [];
            }
            // get the kernels associated with notebooks.
            const notebooks = await getAllNotebooksWithKernels();
            return notebooks;
        }
        if (isNotebookDocument(element)) {
            const kernel = await getKernelForNotebook(element);
            if (!kernel) {
                return [];
            }
            const info = await getRemoteEnvironmentInfo(kernel);
            if (!info) {
                return [];
            }
            return [new RemoteEnvironmentWrapper(new WrapperKernel(kernel, element), info)];
        }
        return this.envTreeDataProvider!.getChildren(element);
    }
}
