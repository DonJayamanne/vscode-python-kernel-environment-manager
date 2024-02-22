import { MarkdownString, ThemeIcon, TreeItem, TreeItemCollapsibleState, Uri, l10n } from 'vscode';
import { getEnvironmentType } from '../python/utils';
import { PackageInfo } from '../python/packages';
import * as path from '../utils/path';
import { WrapperKernel } from '../python/jupyter';
import { RemoteEnvironment, Environment } from '../python/types';
import { isCondaEnvironment } from '../python/conda';

export type PackageStatus = 'DetectingLatestVersion' | 'UpdatingToLatest' | 'UnInstalling' | 'Updating' | undefined;
export class Package {
    public latestVersion?: string;
    public status?: PackageStatus = 'DetectingLatestVersion';

    constructor(
        public readonly parent: RemotePackageWrapper,
        public readonly env: RemoteEnvironment,
        public readonly pkg: PackageInfo,
    ) {
        parent.packages.push(this);
    }

    public asTreeItem() {
        const tree = new TreeItem(this.pkg.name);
        tree.contextValue = 'package:';
        tree.description = this.pkg.version;
        let tooltip = '';
        if ('channel' in this.pkg) {
            tooltip = [this.pkg.channel || '', this.pkg.base_url || ''].filter((item) => item.trim().length).join(': ');
        }
        if (this.latestVersion) {
            tree.contextValue = 'package:outdated';
            tree.tooltip = new MarkdownString(
                `$(warning): ${l10n.t('Latest Version')}: ${this.latestVersion}\n${tooltip}`,
                true,
            );
            tree.iconPath = this.status ? new ThemeIcon('loading~spin') : new ThemeIcon('warning');
        } else {
            tree.tooltip = tooltip;
            tree.iconPath = this.status ? new ThemeIcon('loading~spin') : new ThemeIcon('package');
        }
        return tree;
    }
}

function getEnvLabel(env: Environment) {
    if (env.environment?.name) {
        return env.environment.name;
    }
    if (env.environment?.folderUri) {
        return path.basename(env.environment.folderUri.fsPath);
    }
    if (env.executable.uri) {
        return path.basename(path.dirname(path.dirname(env.executable.uri.fsPath)));
    }
    return path.basename(env.path);
}

export class RemoteEnvironmentWrapper {
    public get id() {
        return this.env.id;
    }
    constructor(public kernel: WrapperKernel, public readonly env: Environment) {}

    public asTreeItem(defaultState: TreeItemCollapsibleState = TreeItemCollapsibleState.Collapsed) {
        const env = this.env;
        const version = env.version ? `${env.version.major}.${env.version.minor}.${env.version.micro}` : '';
        const label = getEnvLabel(env);
        const activePrefix = '';
        const tree = new TreeItem(activePrefix + label + (version ? ` (Python ${version})` : ''), defaultState);
        const executable = path.relativeToHome(env.home, env.environment?.folderUri?.fsPath || env.path);
        tree.tooltip = [version, executable].filter((item) => !!item).join('\n');
        tree.tooltip = new MarkdownString(
            getEnvironmentInfo(env)
                .map((item) => `**${item.label}**: ${item.value}  `)
                .join('\n'),
        );
        tree.description = executable;
        tree.contextValue = `env:${getEnvironmentType(env)} `;
        if (env.executable.sysPrefix) {
            tree.contextValue = `${tree.contextValue.trim()}:hasSysPrefix`;
        }
        tree.iconPath = ThemeIcon.File;
        tree.resourceUri = Uri.file('one.py');
        return tree;
    }
}

export class EnvironmentInfo {
    constructor(public readonly label: string, public value: string) {}
}
export class EnvironmentInformationWrapper {
    constructor(public readonly env: Environment) {}
}
export class RemoteEnvironmentInformationWrapper {
    constructor(public readonly kernel: WrapperKernel, public readonly env: Environment) {}
}
export class RemotePackageWrapper {
    public readonly packages: Package[] = [];
    public readonly env: RemoteEnvironment;
    constructor(public kernel: WrapperKernel, env: Environment) {
        this.env = new RemoteEnvironment(kernel, env);
    }
}
export type PythonEnvironmentTreeNode =
    | RemoteEnvironmentWrapper
    | EnvironmentInformationWrapper
    | RemoteEnvironmentInformationWrapper
    | EnvironmentInfo
    | Package
    | RemotePackageWrapper;

export function getEnvironmentInfo(env: Environment) {
    const info: EnvironmentInfo[] = [];
    let isRemoteEnv = false;
    const isEmptyCondaEnv = isCondaEnvironment(env) && !env.executable.uri;
    if (env.environment?.name) {
        info.push(new EnvironmentInfo(l10n.t('Name'), env.environment?.name));
    }
    if (!env.environment?.name && env.environment?.folderUri && isCondaEnvironment(env)) {
        info.push(new EnvironmentInfo(l10n.t('Name'), path.basename(env.environment.folderUri.fsPath)));
    }
    if (env.version?.sysVersion) {
        info.push(new EnvironmentInfo(l10n.t('Version'), env.version.sysVersion));
    }
    if (!isEmptyCondaEnv && env.executable.bitness && env.executable.bitness !== 'Unknown') {
        info.push(new EnvironmentInfo(l10n.t('Architecture'), env.executable.bitness));
    }
    if (!isEmptyCondaEnv && env.path) {
        info.push(
            new EnvironmentInfo(l10n.t('Executable'), isRemoteEnv ? env.path : path.relativeToHome(env.home, env.path)),
        );
    }
    if (!isEmptyCondaEnv && env.executable.sysPrefix) {
        info.push(
            new EnvironmentInfo(
                l10n.t('SysPrefix'),
                isRemoteEnv ? env.executable.sysPrefix : path.relativeToHome(env.home, env.executable.sysPrefix),
            ),
        );
    }
    if (env.environment?.workspaceFolder) {
        info.push(
            new EnvironmentInfo(
                l10n.t('Folder'),
                isRemoteEnv
                    ? env.environment.workspaceFolder.uri.fsPath
                    : path.relativeToHome(env.home, env.environment.workspaceFolder.uri.fsPath),
            ),
        );
    }

    return info;
}
