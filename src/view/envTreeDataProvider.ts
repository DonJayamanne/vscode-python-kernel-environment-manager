import {
    Disposable,
    EventEmitter,
    ThemeIcon,
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    l10n,
} from 'vscode';
import { getOutdatedPackages, getPackages } from '../python/packages';
import {
    PythonEnvironmentTreeNode,
    Package,
    EnvironmentInformationWrapper,
    EnvironmentInfo,
    getEnvironmentInfo,
    RemoteEnvironmentWrapper,
    RemotePackageWrapper,
    RemoteEnvironmentInformationWrapper,
} from './types';
import { createDeferred } from '../utils/async';
import { traceError } from '../logging';
import { RemoteEnvironment } from '../python/types';

const packagesByEnv = new Map<string, Promise<Map<string, Package>>>();
const outdatedPackagesByEnv = new Map<string, Map<string, string>>();
const getEnv = (e: RemoteEnvironment) => (e instanceof RemoteEnvironment ? e.env : e);

export class PythonEnvironmentTreeDataProvider implements TreeDataProvider<PythonEnvironmentTreeNode> {
    private readonly disposables: Disposable[] = [];
    private readonly _changeTreeData = new EventEmitter<PythonEnvironmentTreeNode | void | undefined | null>();
    public readonly onDidChangeTreeData = this._changeTreeData.event;
    constructor() {}

    public dispose() {
        this._changeTreeData.dispose();
        this.disposables.forEach((d) => d.dispose());
    }

    async getTreeItem(
        element: PythonEnvironmentTreeNode,
        defaultState: TreeItemCollapsibleState = TreeItemCollapsibleState.Collapsed,
    ): Promise<TreeItem> {
        if (element instanceof RemoteEnvironmentWrapper) {
            return element.asTreeItem(defaultState);
        }
        if (
            element instanceof EnvironmentInformationWrapper ||
            element instanceof RemoteEnvironmentInformationWrapper
        ) {
            const tree = new TreeItem(l10n.t('Info'), defaultState);
            tree.contextValue = 'envInfo';
            tree.iconPath = new ThemeIcon('info');
            return tree;
        }
        if (element instanceof Package) {
            return element.asTreeItem();
        }
        if (element instanceof RemotePackageWrapper) {
            const tree = new TreeItem(l10n.t('Packages'), defaultState);
            tree.contextValue = 'packageContainer';
            tree.iconPath = new ThemeIcon('package');
            return tree;
        }
        const tree = new TreeItem(element.label);
        tree.description = element.value;
        tree.contextValue = 'info';
        tree.tooltip = element.value;
        return tree;
    }

    public showOutdatedPackages(env: RemoteEnvironment | RemoteEnvironmentWrapper) {
        const envId = getEnv(env).id;
        const map = packagesByEnv.get(envId);
        if (!map) {
            traceError(`Failed to get packages for ${envId}`);
            return;
        }
        map.then((installedPackages) => {
            for (const [, installedPackage] of installedPackages) {
                installedPackage.status = 'DetectingLatestVersion';
                this._changeTreeData.fire(installedPackage);
            }
            getOutdatedPackages(env)
                .then((outdatedPackages) => {
                    outdatedPackagesByEnv.set(envId, outdatedPackages);
                    for (const [pkgId, installedPackage] of installedPackages) {
                        installedPackage.latestVersion = outdatedPackages.get(pkgId);
                        installedPackage.status = undefined;
                        this._changeTreeData.fire(installedPackage);
                    }
                })
                .finally(() => {
                    // If there are any errors, of if we failed to get the latest version, then remove the status.
                    for (const [, installedPackage] of installedPackages) {
                        installedPackage.status = undefined;
                        this._changeTreeData.fire(installedPackage);
                    }
                });
        }).catch((ex) => traceError(`Failed to get outdated packages for ${env.env.id}`, ex));
    }
    public async getChildren(element?: PythonEnvironmentTreeNode): Promise<PythonEnvironmentTreeNode[]> {
        if (!element) {
            return [];
        }
        if (element instanceof Package) {
            return [];
        }
        if (element instanceof RemoteEnvironmentInformationWrapper) {
            return getEnvironmentInfo(element.env);
        }
        if (element instanceof EnvironmentInfo) {
            return [];
        }
        if (element instanceof RemoteEnvironmentWrapper) {
            return [
                new RemoteEnvironmentInformationWrapper(element.kernel, element.env),
                new RemotePackageWrapper(element.kernel, element.env),
            ];
        }
        if (element instanceof RemotePackageWrapper) {
            let env = element.env;
            const completedPackages = createDeferred<Map<string, Package>>();
            const envId = getEnv(env).id;
            packagesByEnv.set(envId, completedPackages.promise);
            return getPackages(env).then((pkgs) => {
                const packagesMap = new Map<string, Package>();
                const packages = pkgs.map((pkg) => {
                    const item = new Package(element, env, pkg);
                    item.status = undefined;
                    packagesMap.set(pkg.name, item);
                    return item;
                });
                completedPackages.resolve(packagesMap);
                return packages;
            });
        }
        return [];
    }
}
