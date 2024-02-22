import {
    exportCondaPackages,
    getCondaPackages,
    getOutdatedCondaPackages,
    installCondaPackage,
    uninstallCondaPackage,
    updateCondaPackage,
    updateCondaPackages,
} from './conda';
import { traceError } from '../logging';
import {
    exportPipPackages,
    getOutdatedPipPackages,
    getPipPackages,
    installPipPackage,
    uninstallPipPackage,
    updatePipPackage,
    updatePipPackages,
} from './pip';
import { getEnvironmentType } from './utils';
import { EnvironmentType, RemoteEnvironment, KnownEnvironmentTypes } from './types';
import { RemoteEnvironmentWrapper } from '../view/types';

export type PackageInfo = { name: string; version: string; base_url?: string; channel?: string };
export const getPackagesRegistry = new Map<
    EnvironmentType,
    { priority: number; provider: (env: RemoteEnvironment | RemoteEnvironmentWrapper) => Promise<PackageInfo[]> }
>();
getPackagesRegistry.set('Conda', { priority: 100, provider: getCondaPackages });
getPackagesRegistry.set('Unknown', { priority: 0, provider: getPipPackages });
export async function getPackages(env: RemoteEnvironment | RemoteEnvironmentWrapper) {
    try {
        const values = Array.from(getPackagesRegistry.values())
            .sort((a, b) => a.priority - b.priority)
            .map((item) => item.provider);

        const results = await Promise.all(values.map((provider) => provider(env)));
        const packages = new Map<string, PackageInfo>();
        for (const result of results) {
            // Items with higher priority win.
            result.forEach((pkg) => packages.set(pkg.name, pkg));
        }
        return Array.from(packages.values()).sort((a, b) =>
            a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase()),
        );
    } catch (ex) {
        traceError(`Failed to get package information for ${env.env.id})`, ex);
        return [];
    }
}
export const getOutdatedPackagesRegistry = new Map<
    KnownEnvironmentTypes,
    {
        priority: number;
        provider: (env: RemoteEnvironment | RemoteEnvironmentWrapper) => Promise<Map<string, string> | undefined>;
    }
>();
getOutdatedPackagesRegistry.set('Conda', { priority: 100, provider: getOutdatedCondaPackages });
getOutdatedPackagesRegistry.set('Unknown', { priority: 0, provider: getOutdatedPipPackages });
export async function getOutdatedPackages(env: RemoteEnvironment | RemoteEnvironmentWrapper) {
    try {
        const values = Array.from(getOutdatedPackagesRegistry.values())
            .sort((a, b) => b.priority - a.priority)
            .map((item) => item.provider);
        const results = await Promise.all(values.map((provider) => provider(env)));
        // First non null wins
        return results.find((item) => !!item) || new Map<string, string>();
    } catch (ex) {
        traceError(`Failed to get latest package information for ${env.env.id})`, ex);
        return new Map<string, string>();
    }
}

export const updatePackageRegistry = new Map<
    KnownEnvironmentTypes,
    (env: RemoteEnvironment | RemoteEnvironmentWrapper, pkg: PackageInfo) => Promise<void>
>();

updatePackageRegistry.set('Conda', updateCondaPackage);
updatePackageRegistry.set('VirtualEnvironment', updatePipPackage);
updatePackageRegistry.set('Unknown', updatePipPackage);
export async function updatePackage(env: RemoteEnvironment | RemoteEnvironmentWrapper, pkg: PackageInfo) {
    try {
        const provider = updatePackageRegistry.get(getEnvironmentType(env.env));
        await provider?.(env, pkg as any);
    } catch (ex) {
        traceError(`Failed to update package ${pkg.name} in ${env.env.id})`, ex);
        return [];
    }
}
export const updatePackagesRegistry = new Map<
    KnownEnvironmentTypes,
    (env: RemoteEnvironment | RemoteEnvironmentWrapper) => Promise<void>
>();
updatePackagesRegistry.set('Conda', updateCondaPackages);
updatePackagesRegistry.set('VirtualEnvironment', updatePipPackages);
updatePackagesRegistry.set('Unknown', updatePipPackages);

export async function updatePackages(env: RemoteEnvironment | RemoteEnvironmentWrapper) {
    try {
        const provider = updatePackagesRegistry.get(getEnvironmentType(env.env));
        await provider?.(env);
    } catch (ex) {
        traceError(`Failed to update packages in ${env.env.id})`, ex);
        return [];
    }
}
export const uninstallPackagesRegistry = new Map<
    KnownEnvironmentTypes,
    (env: RemoteEnvironment | RemoteEnvironmentWrapper, pkg: PackageInfo) => Promise<void>
>();
uninstallPackagesRegistry.set('Conda', uninstallCondaPackage);
uninstallPackagesRegistry.set('VirtualEnvironment', uninstallPipPackage);
uninstallPackagesRegistry.set('Unknown', uninstallPipPackage);

export async function uninstallPackage(env: RemoteEnvironment | RemoteEnvironmentWrapper, pkg: PackageInfo) {
    try {
        const provider = uninstallPackagesRegistry.get(getEnvironmentType(env.env));
        await provider?.(env, pkg as any);
    } catch (ex) {
        traceError(`Failed to uninstall package ${pkg.name} in ${env.env.id})`, ex);
        return [];
    }
}

export const exportPackagesRegistry = new Map<
    KnownEnvironmentTypes,
    (env: RemoteEnvironment | RemoteEnvironmentWrapper) => Promise<
        | {
              contents: string | undefined;
              language: string;
              file: string;
          }
        | undefined
    >
>();
exportPackagesRegistry.set('Conda', exportCondaPackages);
exportPackagesRegistry.set('VirtualEnvironment', exportPipPackages);
exportPackagesRegistry.set('Unknown', exportPipPackages);

export async function exportPackages(env: RemoteEnvironment | RemoteEnvironmentWrapper) {
    try {
        const provider = exportPackagesRegistry.get(getEnvironmentType(env.env));
        return provider?.(env);
    } catch (ex) {
        traceError(`Failed to export environment ${env.env.id}`, ex);
    }
}
export const searchPackagesRegistry = new Map<
    KnownEnvironmentTypes,
    (env: RemoteEnvironment | RemoteEnvironmentWrapper) => Promise<string | undefined>
>();
export async function searchPackage(env: RemoteEnvironment | RemoteEnvironmentWrapper) {
    try {
        const provider = searchPackagesRegistry.get(getEnvironmentType(env.env));
        return provider?.(env);
    } catch (ex) {
        traceError(`Failed to install a package in ${env.env.id})`, ex);
    }
}
export const installPackagesRegistry = new Map<
    KnownEnvironmentTypes,
    (env: RemoteEnvironment | RemoteEnvironmentWrapper, pkg: PackageInfo) => Promise<void>
>();
installPackagesRegistry.set('Conda', installCondaPackage);
installPackagesRegistry.set('VirtualEnvironment', installPipPackage);
installPackagesRegistry.set('Unknown', installPipPackage);

export async function installPackage(env: RemoteEnvironment | RemoteEnvironmentWrapper, pkg: PackageInfo) {
    try {
        const provider = installPackagesRegistry.get(getEnvironmentType(env.env));
        await provider?.(env, pkg);
    } catch (ex) {
        traceError(`Failed to install a package in ${env.env.id})`, ex);
        return [];
    }
}
