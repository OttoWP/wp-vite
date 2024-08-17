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
    css?: string;

    /**
     * Types of assets and regex rule.
     */
    assets?: Record<string, RegExp>;

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
    input?: {
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
    source?: (root: string, path: string) => ReturnType<typeof parseFilePath>;

    /**
     * The output of the file in outDir.
     */
    output?: (output: string, source: ReturnType<typeof parseFilePath>, ext: string) => string;

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
    externalWrapper?: {

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
            externalWrapper: {
                enable: true,
                banner: `document.addEventListener('DOMContentLoaded', () => {`,
                footer: `});`,
            },
        },
        ...userOptions,
    };

    /**
     * Get interactivity entries.
     */
    const interactivity = options.input?.interactivity ? flattenToStringArray(options.input.interactivity) : [];

    /**
     * Collect styles.
     */
    const styles: { [cssOrigin: string]: string } = {};

    /**
     * Gathers assets (images, svg, fonts) per provided regex rules
     */
    const collectAssets = () => {
        if (!options.assets) return null;

        const assets: Record<string, string[]> = {};

        for (const key in options.assets) {
            if (!assets[key]) {
                assets[key] = fg.sync([path.resolve(ViteConfig.root, '**', key, '**')]);
            }
        }

        if (options.log) {
            console.log('Assets', assets)
        }

        return assets
    };

    /**
     * Gather resources from entries (PHP, JSON etc.)
     */
    const collectResources = (): Record<string, string[]> | null => {
        if (!options.input) return null;

        const resources = flattenToStringArray(options.input.entries);
        const filtered = resources.filter(file => !file.endsWith('.js') && !file.endsWith(`.${options.css}`));
        const grouped: Record<string, string[]> = {};

        filtered.forEach(entry => {
            const ext = path.extname(entry).toLowerCase();
            if (!grouped[ext]) {
                grouped[ext] = [];
            }
            grouped[ext].push(entry);
        });

        if (options.log) {
            console.log('Resources', grouped)
        }

        return grouped;
    };

    /**
     * Construct emit params.
     *
     * @param output
     * @param filePath
     */
    const emitParams = (output: string, filePath: string): Rollup.EmittedAsset | null => {
        if (!options.source || !options.output) return null;

        const file = options.source(path.basename(ViteConfig.root), filePath);
        const fileName = options.output(output, file, file.ext)
            .replace(/\[name\]/g, file.fileName)
            .replace(/\[ext\]/g, `.${file.ext}`);

        return {
            type: 'asset',
            fileName,
            originalFileName: `${file.fileName}.${file.ext}`,
            source: fs.readFileSync(file.path),
            name: path.relative(path.resolve(ViteConfig.root), file.path)
        };
    }

    /**
     * Creates the dependency list & cache buster.
     *
     * @param module
     * @param bundleOptions
     * @param dependencies
     */
    const createPhpAssetFile = (module: Rollup.OutputChunk, bundleOptions: Rollup.NormalizedOutputOptions, dependencies: string[]) => {
        if (!bundleOptions.dir || !module.facadeModuleId) return;

        const outPath = path.resolve(bundleOptions.dir, path.dirname(module.fileName));
        const file = fs.readFileSync(module.facadeModuleId);
        const hash = createHash('sha256').update(file).digest('hex').slice(0, 20)

        fs.mkdirSync(outPath, {recursive: true});
        const phpArrayContent = '<?php return ' + varExport({
            'dependencies': dependencies,
            'version': hash
        }, false) + ';';
        fs.writeFileSync(path.join(outPath, `${module.name}.asset.php`), phpArrayContent, 'utf-8');
    }

    /**
     * Create the dependency array from a module.
     *
     * @param module
     * @param isInteractivity
     * @param globals
     * @param externals
     */
    const createDependencyArray = (module: Rollup.OutputChunk, isInteractivity: boolean, globals: Rollup.GlobalsOption, externals: string[]): string[] => {
        const dependencies = [
            ...(typeof options.dependencies === 'function'
                ? options.dependencies(module)
                : Array.isArray(options.dependencies) ? options.dependencies : []),
        ];

        // Add WordPress dependencies based on externals/imports we've found inside the file
        if (options.wpDeps) {
            Object.entries(globals)
                .filter(([key, value]) => externals.filter(external => module.code.includes(external)).includes(isInteractivity ? key : value))
                .map(([key, _value]: [string, any]) => isInteractivity ? key : key.replace('@wordpress/', 'wp-'))
                .forEach(dependency => {
                    if (!dependencies.includes(dependency)) {
                        dependencies.push(dependency);
                    }
                });
        }

        return dependencies;
    }

    /**
     * Create code wrappers.
     *
     * @param module
     * @param externals
     */
    const createCodeWrappers = async (module: Rollup.OutputChunk, externals: string[]) => {
        if (options.externalWrapper?.enable) {
            const detected = externals.filter(external => module.code.includes(external) && !module.code.includes('DOMContentLoaded'));

            if (detected.length > 0) {
                const globalVars = detected.map(g => `${g}`).join(', ');

                // Wrap the code in a DOMContentLoaded event listener so required variables can load first
                const wrappedCode = `
${options.externalWrapper.banner}
    if (typeof ${globalVars} !== 'undefined') {
        ${module.code}
    } else {
        console.error('Required global variables [${globalVars}] are not available.');
    }
${options.externalWrapper.footer}
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

            // Encapsulate code with invoked closure.
            module.code = options.banner
                + module.code
                + options.footer;
        }
    }

    /**
     * Set correct paths in vite metadata and collect styles.
     *
     * @param module
     */
    const setImportedCss = (module: Rollup.OutputChunk) => {
        if (module.viteMetadata && options.css) {
            const cssExt = options.css;

            Array.from(module.viteMetadata.importedCss).forEach(cssFile => {
                const cssFileName = cssFile.split('/').pop()?.split('-')[0] + `.${cssExt}`;
                const cssOrigin = cssFile;

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
    }

    /**
     * Set the out path for collected styles.
     *
     * @param bundle
     */
    const setCSsOutPath = (bundle: Rollup.OutputBundle) => {
        Object.values(bundle).forEach(module => {
            if (module.type === 'asset') {

                if (styles[module.fileName]) {
                    module.fileName = styles[module.fileName];
                }
            }
        });
    }

    /**
     * Remove the empty CSS comment that Vite generates in JS code.
     *
     * @param module
     */
    const removeEmptyCssComment = (module: Rollup.OutputChunk) => {
        module.code = module.code.replace(/\/\*\s*empty css\s*\*\//g, '');
    }

    /**
     * Create the PHP manifest file if enabled.
     *
     * @param manifestPath
     */
    const createPhpManifestFile = (manifestPath: string) => {
        const phpManifestPath = path.resolve(path.dirname(manifestPath), 'manifest.php');

        if (!fs.existsSync(manifestPath)) return;

        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        fs.writeFileSync(phpManifestPath, `<?php\n\nreturn ${varExport(manifest)};\n`, 'utf-8');

        if (options.log) {
            console.log(`PHP manifest generated at: ${phpManifestPath}`);
        }
    }

    /**
     * Handle hot update for PHP files.
     *
     * @param file
     * @param server
     */
    const handleHotUpdateForPhp = (file: string, server: Vite.ViteDevServer) => {
        if (file.endsWith('.php')) {
            server.ws.send({type: 'full-reload', path: '*'});
        }
    }

    /**
     * Plugin.
     */
    return {
        name: 'vite-wp-bundler',

        /**
         * Resolve config.
         *
         * @param resolvedConfig
         */
        configResolved(resolvedConfig) {
            ViteConfig = resolvedConfig;
        },

        /**
         * Build Start Hook.
         */
        async buildStart() {
            const sources = {...(collectResources() ?? {}), ...(collectAssets() ?? {})};

            for (const type in sources) {
                if (sources[type]) {
                    sources[type].forEach(filePath => {
                        const params = emitParams(`${type}/[name][ext]`, filePath);
                        if (params) {
                            this.emitFile(params);
                        }
                    });
                }
            }
        },

        /**
         * Generate Bundle Hook.
         *
         * @param bundleOptions
         * @param bundle
         */
        async generateBundle(bundleOptions: Rollup.NormalizedOutputOptions, bundle: Rollup.OutputBundle) {
            if (!options.input) return;

            const globals: Rollup.GlobalsOption = !Array.isArray(ViteConfig.build?.rollupOptions?.output)
                ? ViteConfig.build?.rollupOptions?.output?.globals ?? Globals
                : Globals;

            for (const module of Object.values(bundle)) {
                if (module.type === 'chunk' && module.facadeModuleId) {
                    const isCssChunk: boolean = !module.fileName.endsWith('.js');
                    const isInteractivity: boolean = "interactivity" in options.input
                        ? interactivity.includes(module.facadeModuleId)
                        : false;

                    // For interactivity (esModule) we will be needing the import instead of dep.
                    const externals: string[] = isInteractivity
                        ? Object.keys(globals)
                        : Object.values(globals);

                    if (!isInteractivity && !isCssChunk) {
                        await createCodeWrappers(module, externals)
                    }

                    const dependencies: string[] = createDependencyArray(module, isInteractivity, globals, externals);

                    createPhpAssetFile(module, bundleOptions, dependencies)
                    setImportedCss(module)
                    removeEmptyCssComment(module)
                }
            }
            setCSsOutPath(bundle)
        },

        /**
         * Close Bundle hook.
         */
        closeBundle() {
            if (options.phpManifest && options.manifest) {
                createPhpManifestFile(path.resolve(ViteConfig.root, ViteConfig.build.outDir, options.manifest))
            }
        },

        /**
         * Handle Hot Update hook.
         *
         * @param file
         * @param server
         */
        handleHotUpdate({file, server}) {
            handleHotUpdateForPhp(file, server);
        },
    };
}