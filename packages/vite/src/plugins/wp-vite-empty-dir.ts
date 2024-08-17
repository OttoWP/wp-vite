import path from 'path';
import fs from 'fs';
import * as Vite from 'vite';

export interface WpViteEmptyDirOptions {

    /**
     * Log deleted folders.
     */
    log?: boolean;

    /**
     * Choose which folders to keep.
     */
    keepOutDir?: string[];
}

export function wpViteEmptyDir(userOptions: WpViteEmptyDirOptions = {}): Vite.PluginOption {
    let ViteConfig: Vite.ResolvedConfig;

    const options = {
        log: false,
        keepOutDir: [],
        ...userOptions,
    };


    return {
        name: 'vite-empty-dir',

        configResolved(resolvedConfig) {
            ViteConfig = resolvedConfig;
        },

        buildStart() {
            const outDir = path.resolve(ViteConfig.root, ViteConfig.build.outDir);
            const deleted = [];

            if (fs.existsSync(outDir)) {
                const items   = fs.readdirSync(outDir, {withFileTypes: true});

                for (const item of items) {
                    const itemPath = path.join(outDir, item.name);

                    if (!options.keepOutDir.includes(item.name)) {
                        if (item.isDirectory()) {
                            fs.rmSync(itemPath, {recursive: true, force: true});
                        } else if (item.isFile()) {
                            fs.unlinkSync(itemPath);
                        }
                        deleted.push(itemPath)
                    }
                }

                if (options.log) {
                    console.log('Deleted ', deleted);
                }
            }
        },
    }
}