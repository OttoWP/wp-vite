import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';
import * as Vite from 'vite';
import * as Rollup from "rollup";
import Globals from "../helpers/globals";
import {createHash} from 'crypto';
import {minify, MinifyOptions} from 'terser';
import {parseFilePath} from '../helpers/strings';
import {varExport} from '../helpers/object';
import {flattenToStringArray} from "../helpers/arrays";
export interface WpViteBundlerOptions {

    /**
     * CSS extension type. Default: pcss.
     */
    css: string;

    /**
     * Types of assets and regex rule.
     */
    assets: Record<string, RegExp>;

    /**
     * WP enqueue dependency rules.
     */
    dependencies?: string[] | ((module: any) => string[]);

    /**
     * Whether to include WP globals from file as dependencies. Default: true;
     */
    wpDeps?: boolean;

    /**
     * The manifest path in outDir.
     */
    manifest?: string;

    /**
     * Whether to include a PHP version of the manifest instead of a JSON file.
     */
    phpManifest?: boolean;

    /**
     * Enable logs.
     */
    log?: boolean;

    /**
     * Entries to bundle.
     */
    input: {
        /**
         * ES entries.
         */
        entries: string[] | string[][];

        /**
         * EsModules entries.
         */
        interactivity: string[] | string[][];
    };

    /**
     * Parsed file path object of the source.
     */
    source: (root: string, path: string) => ReturnType<typeof parseFilePath>;

    /**
     * The output of the file in outDir.
     */
    output: (output: string, source: ReturnType<typeof parseFilePath>, ext: string) => string;

    /**
     * File banner.
     */
    banner?: string;

    /**
     * File footer.
     */
    footer?: string;

    /**
     * Wrapper code if file contains globals for non EsModules.
     */
    globalsWrapper?: {

        /**
         * Enable wrapper.
         */
        enable: boolean;

        /**
         * Wrapper banner.
         */
        banner: string;

        /**
         * Wrapper footer.
         */
        footer: string;
    };
}

export function wpViteBundler(userOptions: WpViteBundlerOptions, mode: string): Vite.PluginOption {
    let ViteConfig: Vite.ResolvedConfig;

    const options: WpViteBundlerOptions = {
        ...{
            css: 'pcss',
            assets: {
                images: /png|jpe?g|gif|tiff|bmp|ico/i,
                svg: /\.svg$/i,
                fonts: /ttf|woff|woff2/i,
            },
            dependencies: [],
            wpDeps: true,
            manifest: '.vite/manifest.json',
            phpManifest: false,
            log: false,
            input: {entries: [], interactivity: []},
            source: (root, path) => parseFilePath(root, path),
            output: (output, source, ext) => `${source.outPath}/[name].${ext}`,
            banner: '(() => {\'use strict\';',
            footer: '})();',
            globalsWrapper: {
                enable: true,
                banner: `document.addEventListener('DOMContentLoaded', () => {`,
                footer: `});`,
            },
        },
        ...userOptions,
    };

    /**
     * Images, SVG's, Fonts etc..
     */
    const getAssets = () => {
        const assets: string[] = [];

        Object.keys(options.assets).forEach(assetFolder => {
            fg.sync([
                ['**', assetFolder, '**'], [assetFolder, '**'],
            ].map(pathPattern => path.resolve(ViteConfig.root, ...pathPattern))).forEach(assetPath => {
                assets.push(assetPath);
            });
        });

        // Group by assets key
        return assets.reduce<Record<string, string[]>>((acc, file) => {
            for (const [key, regex] of Object.entries(options.assets)) {
                if (regex.test(file)) {
                    acc[key].push(file);
                    return acc;
                }
            }
            return acc;
        }, Object.fromEntries([...Object.keys(options.assets)].map(key => [key, []])));
    };

    /**
     * Things that are part of entries (JSON & PHP files)
     */
    const getEntries = () => {
        const entries = flattenToStringArray(options.input.entries).filter(file => !file.endsWith('.js') && !file.endsWith(`.${options.css}`));

        // Group by extension
        return entries.reduce((emits: { [ext: string]: string[] }, entry: string) => {
            const ext = path.extname(entry).toLowerCase();
            if (!emits[ext]) {
                emits[ext] = [];
            }
            emits[ext].push(entry);
            return emits;
        }, {} as { [ext: string]: string[] });
    };

    return {
        name: 'vite-wp-bundler',

        configResolved(resolvedConfig) {
            ViteConfig = resolvedConfig;
        },

        async buildStart() {
            const assets = getAssets();
            const entries = getEntries();

            // Emit entries
            for (const ext in entries) {
                entries[ext].forEach(entryPath => {
                    if (options.source && options.output) {
                        const source = options.source(path.basename(ViteConfig.root), entryPath);
                        const output = options.output(`${source.ext}/[name]${ext}`, source, source.ext).replace(/\[name\]/g, source.fileName);
                        const name = path.relative(path.resolve(ViteConfig.root), source.path);
                        this.emitFile({
                            type: 'asset',
                            fileName: output,
                            originalFileName: `${source.fileName}${ext}`,
                            source: fs.readFileSync(source.path),
                            name: name,
                        });
                    }
                });
            }

            // Emit assets
            for (const type in assets) {
                assets[type].forEach(assetPath => {
                    const source = options.source(path.basename(ViteConfig.root), assetPath);
                    const output = `${type}/${source.fileName}.${source.ext}`;
                    const name = path.relative(path.resolve(ViteConfig.root), source.path);
                    this.emitFile({
                        type: 'asset',
                        fileName: output,
                        originalFileName: `${source.fileName}.${source.ext}`,
                        source: fs.readFileSync(source.path),
                        name: name,
                    });
                });
            }
        },

        async generateBundle(bundleOptions: Rollup.NormalizedOutputOptions, bundle: Rollup.OutputBundle) {
            const hash = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 20);
            const styles: { [cssOrigin: string]: string } = {};
            const userGlobals = !Array.isArray(ViteConfig.build?.rollupOptions?.output)
                ? ViteConfig.build?.rollupOptions?.output?.globals ?? Globals
                : Globals;

            // Loop chunks
            for (const module of Object.values(bundle)) {
                if (module.type === 'chunk' && module.facadeModuleId && bundleOptions.dir) {
                    const isEsModule = "interactivity" in options.input
                        ? flattenToStringArray(options.input.interactivity).includes(module.facadeModuleId)
                        : false;
                    const isCss = !module.fileName.endsWith('.js');
                    const globals = isEsModule
                        ? Object.keys(userGlobals)
                        : Object.values(userGlobals);
                    const outPath = path.resolve(bundleOptions.dir, path.dirname(module.fileName));

                    // Set dependencies from the config
                    const dependencies = [
                        ...(typeof options.dependencies === 'function'
                            ? options.dependencies(module)
                            : Array.isArray(options.dependencies) ? options.dependencies : []),
                    ];

                    // Add WordPress dependencies based on globals we've found inside the file
                    if (!options.wpDeps || options.wpDeps && options.wpDeps === true) {
                        Object.entries(userGlobals).filter(([key, value]) => {
                            const includedGlobals = globals.filter(global => module.code.includes(global));
                            return isEsModule ? includedGlobals.includes(key) : includedGlobals.includes(value);
                        }).map(([key, value]) => key).forEach(dependency => {
                            dependency = isEsModule ? dependency : dependency.replace('@wordpress/', 'wp-');
                            if (!dependencies.includes(dependency)) {
                                dependencies.push(dependency);
                            }
                        });
                    }

                    // Create the dependency & cache buster php file.
                    fs.mkdirSync(outPath, {recursive: true});
                    const phpArrayContent = '<?php return ' + varExport({
                        'dependencies': dependencies,
                        'version': hash(module.facadeModuleId)
                    }, false) + ';';
                    fs.writeFileSync(path.join(outPath, `${module.name}.asset.php`), phpArrayContent, 'utf-8');

                    // Wrap code for non es modules if code contains any of the specified globals
                    if (options.globalsWrapper && options.globalsWrapper.enable && !isEsModule && !isCss) {
                        const detectedGlobals = globals.filter(global => module.code.includes(global) && !module.code.includes('DOMContentLoaded'));

                        if (detectedGlobals.length > 0) {
                            const globalVars = detectedGlobals.map(g => `${g}`).join(', ');

                            // Wrap the code in a DOMContentLoaded event listener so required variables can load first
                            const wrappedCode = `
${options.globalsWrapper.banner}
    if (typeof ${globalVars} !== 'undefined') {
        ${module.code}
    } else {
        console.error('Required global variables [${globalVars}] are not available.');
    }
${options.globalsWrapper.footer}
`;
                            if (mode === 'development') {
                                module.code = wrappedCode;
                            } else {
                                const minifiedWrappedCode = await minify(wrappedCode, ViteConfig.build.terserOptions as MinifyOptions);

                                if (minifiedWrappedCode.code) {
                                    module.code = minifiedWrappedCode.code;
                                }
                            }
                        }

                        // Encapsulate code with banner & footer
                        module.code = options.banner + module.code + options.footer;
                    }

                    // Get proper outDir folder structure for styles and modify ImportedCss metadata.
                    if (module.viteMetadata) {
                        Array.from(module.viteMetadata.importedCss).forEach(cssFile => {
                            const cssExt = options.css;
                            const cssOrigin = cssFile;
                            const cssFileName = cssFile.split('/').pop()?.split('-')[0] + `.${cssExt}`;
                            if (!styles[cssOrigin]) {
                                styles[cssOrigin] = path.dirname(module.fileName) + '/' + cssFileName.replace(cssExt, 'css');
                            }
                            if (module.viteMetadata?.importedCss) {
                                module.viteMetadata.importedCss.delete(cssFile);
                            }
                            if (module.viteMetadata?.importedAssets) {
                                module.viteMetadata.importedAssets.add(styles[cssOrigin]);
                            }
                        });
                    }

                    // Remove empty CSS comments that gets generated by vite.
                    module.code = module.code.replace(/\/\*\s*empty css\s*\*\//g, '');
                }
            } // End loop chunks

            // Change CSS outDir folder structure.
            Object.values(bundle).forEach(module => {
                if (module.type === 'asset') {

                    if (styles[module.fileName]) {
                        module.fileName = styles[module.fileName];
                    }
                }
            });
        },

        closeBundle() {

            // Create the PHP manifest file
            if (options.phpManifest && options.manifest) {
                const manifestPath = path.resolve(ViteConfig.root, ViteConfig.build.outDir, options.manifest);
                const phpManifestPath = path.resolve(path.dirname(manifestPath), 'manifest.php');

                if (fs.existsSync(manifestPath)) {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                    const phpArrayContent = '<?php\n\nreturn ' + varExport(manifest) + ';\n';

                    // Write the PHP array to the manifest.php file
                    fs.writeFileSync(phpManifestPath, phpArrayContent, 'utf-8');

                    if (options.log) {
                        console.log(`PHP manifest generated at: ${phpManifestPath}`);
                    }
                }
            }
        },

        handleHotUpdate({file, server}) {

            // Handle hot update for PHP
            if (file.endsWith('.php')) {
                server.ws.send({type: 'full-reload', path: '*'});
            }
        },
    };
}