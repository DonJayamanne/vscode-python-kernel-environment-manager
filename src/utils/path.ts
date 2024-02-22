import { Uri } from 'vscode';

export function relativeToHome(home: Uri | string, to: Uri | string) {
    const toPath = typeof to === 'string' ? to : to.fsPath;
    const fromPath = typeof home === 'string' ? home : home.fsPath;
    return toPath.replace(fromPath, '~').replace(/\\/g, '/');
}
export function basename(path: Uri | string) {
    const uri = typeof path === 'string' ? Uri.file(path) : path;
    const paths = uri.path.replace(/\\/g, '/').split('/');
    return paths.pop() || '';
}

export function dirname(path: Uri | string) {
    const uri = typeof path === 'string' ? Uri.file(path) : path;
    const paths = uri.path.replace(/\\/g, '/').split('/');
    paths.pop();
    return paths.length ? paths.pop() || '' : '';
}
