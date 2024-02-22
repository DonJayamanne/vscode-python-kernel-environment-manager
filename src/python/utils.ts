import { traceError } from '../logging';
import { Environment, KnownEnvironmentTools, KnownEnvironmentTypes } from './types';

export function getEnvironmentType({ tools }: Environment): KnownEnvironmentTypes {
    const knownTools = tools as KnownEnvironmentTools[];
    if (knownTools.includes('Conda')) {
        return 'Conda';
    }
    if (knownTools.includes('Venv') || knownTools.includes('VirtualEnv') || knownTools.includes('VirtualEnvWrapper')) {
        return 'VirtualEnvironment';
    }
    return 'Unknown';
}

export function getJSONOutputFromPipCommand<T>(output: string, defaultValue: T): T {
    const lines = output
        .split(/\r?\n/g)
        .map((l) => l.trim())
        .filter((l) => l.length);
    if (!lines.length) {
        return defaultValue;
    }
    // Trailing lines can contain other information, such as warnings.
    try {
        return JSON.parse(lines[0]);
    } catch (ex) {
        // Possible there are multiple lines of JSON.
        let json = lines.join('');
        let startChar = json.trim().substring(0, 1);
        if (startChar !== '{' && startChar !== '[') {
            const firstSquare = json.indexOf('[]');
            const firstCurly = json.indexOf('{');
            startChar = firstCurly < firstSquare ? '{' : '[';
        }
        const endChar = startChar === '{' ? '}' : startChar === '[' ? ']' : '';
        json = json.substring(json.indexOf(startChar));
        json = json.substring(0, json.lastIndexOf(endChar) + 1);
        try {
            return JSON.parse(json);
        } catch (ex) {
            traceError(`Failed to parse JSON ${output}`, ex);
            throw ex;
        }
    }
}
