import { ExtensionContext, window } from 'vscode';
import { outputChannel } from './logging';
import { RemoteKernelsTreeDataProvider } from './view/treeDataProvider';
import { detectNewKernels } from './python/jupyter';

export async function activate(context: ExtensionContext): Promise<void> {
    const remoteKernelsTreeDataProvider = new RemoteKernelsTreeDataProvider();
    const treeView = window.createTreeView('remoteKernelEnvironments', {
        treeDataProvider: remoteKernelsTreeDataProvider,
    });
    let startedDetectingNewKernels = false;
    treeView.onDidChangeVisibility((e) => {
        if (!e.visible || startedDetectingNewKernels) {
            return;
        }
        startedDetectingNewKernels = true;
        const result = detectNewKernels();
        context.subscriptions.push(
            result,
            result.event(() => remoteKernelsTreeDataProvider.refresh()),
        );
    });
    context.subscriptions.push(treeView, outputChannel, remoteKernelsTreeDataProvider);
}
