// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import * as path from 'node:path';
import * as esbuild from 'esbuild';
import { green } from 'colors';
import type { BuildOptions, SameShape } from 'esbuild';
import * as fs from 'fs';
import { promisify } from 'util';

const commonExternals = ['log4js', 'vscode', 'commonjs', 'node:crypto'];
const webExternals = commonExternals.concat('os').concat(commonExternals);
const desktopExternals = commonExternals;
const isDevbuild = !process.argv.includes('--production');
const isWatchMode = process.argv.includes('--watch');
const extensionFolder = path.join(__dirname, '..', '..');

function createConfig(
    source: string,
    outfile: string,
    target: 'desktop' | 'web',
    watch: boolean,
): SameShape<BuildOptions, BuildOptions> {
    const inject: string[] = [];
    if (target === 'web') {
        inject.push(path.join(__dirname, isDevbuild ? 'process.development.js' : 'process.production.js'));
    }
    const external = target === 'web' ? webExternals : desktopExternals;
    return {
        entryPoints: [source],
        outfile,
        bundle: true,
        external,
        format: target === 'desktop' || source.endsWith('extension.web.ts') ? 'cjs' : 'esm',
        metafile: isDevbuild && !watch,
        define:
            target === 'desktop'
                ? undefined
                : {
                      BROWSER: 'true', // From webacpk scripts we had.
                      global: 'this',
                  },
        target: target === 'desktop' ? 'node18' : 'es2018',
        platform: target === 'desktop' ? 'node' : 'browser',
        minify: !isDevbuild,
        logLevel: 'info',
        sourcemap: isDevbuild,
        inject,
    };
}
async function build(source: string, outfile: string, options: { watch: boolean; target: 'desktop' | 'web' }) {
    if (options.watch) {
        const context = await esbuild.context(createConfig(source, outfile, options.target, options.watch));
        await context.watch();
    } else {
        const result = await esbuild.build(createConfig(source, outfile, options.target, options.watch));
        const size = fs.statSync(outfile).size;
        const relativePath = `./${path.relative(extensionFolder, outfile)}`;
        console.log(`asset ${green(relativePath)} size: ${(size / 1024).toFixed()} KiB`);
        if (isDevbuild && result.metafile) {
            const metafile = `${outfile}.esbuild.meta.json`;
            await promisify(fs.writeFile)(metafile, JSON.stringify(result.metafile));
            console.log(`metafile ${green(`./${path.relative(extensionFolder, metafile)}`)}`);
        }
    }
}

async function buildAll() {
    await Promise.all([
        build(
            path.join(extensionFolder, 'src', 'extension.ts'),
            path.join(extensionFolder, 'dist', 'extension.node.js'),
            { target: 'desktop', watch: isWatchMode },
        ),
        build(
            path.join(extensionFolder, 'src', 'extension.ts'),
            path.join(extensionFolder, 'dist', 'extension.web.js'),
            { target: 'desktop', watch: isWatchMode },
        ),
    ]);
}

buildAll();
