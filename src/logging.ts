import { l10n, window } from 'vscode';

export const outputChannel = window.createOutputChannel(l10n.t('Python Kernel Environment Manager'), { log: true });

export function traceError(message: string, ex?: unknown | Error | string) {
    if (ex && ex instanceof Error) {
        outputChannel.error(ex, message);
    } else if (ex) {
        outputChannel.error(message, ex);
    } else {
        outputChannel.error(message);
    }
}

export function traceVerbose(message: string, ex?: unknown | Error | string) {
    outputChannel.debug(message, ex?.toString());
}

export function traceWarn(message: string, ex?: Error | string) {
    outputChannel.warn(message, ex?.toString() || '');
}

