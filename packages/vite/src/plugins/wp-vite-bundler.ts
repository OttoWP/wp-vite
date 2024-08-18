import path from 'path';
import fs from 'fs';
import {getGlobalsFromConfig} from "../helpers/globals";
import {createHash} from 'crypto';
import {minify, MinifyOptions} from 'terser';
import {parseFilePath} from '../helpers/strings';
import {varExport} from '../helpers/object';
import {flattenToStringArray} from "../helpers/arrays";
import {ResolvedConfig, Plugin} from "vite";
import {GlobalsOption, NormalizedOutputOptions, OutputBundle, OutputChunk} from "rollup";

export interface WPViteBundlerOptions {

    /**
     * The CSS extension type. Default: 'pcss'.
     */
    css: string;

    /**
     * WordPress enqueue dependency rules.
     */
    dependencies?: string[] | ((module: any) => string[]);

    /**
     * Whether to include WordPress globals from files as dependencies. Default: true.
     */
    wpDeps?: boolean;

    /**
     * Entry points to bundle.
     */
    input: {
        /**
         * Entry points.
         */
        entries: string[] | string[][];

        /**
         * EsModules entry points.
         */
        interactivity: string[] | string[][];
    };

    /**
     * A function to parse the file path of the source.
     */
    source: (root: string, path: string) => ReturnType<typeof parseFilePath>;

    /**
     * A function to determine the output path of a file in the output directory.
     */
    output: (output: string, source: ReturnType<typeof parseFilePath>, ext: string) => string;

    /**
     * Content to be added at the top of each file.
     */
    banner?: string;

    /**
     * Content to be added at the bottom of each file.
     */
    footer?: string;

    /**
     * Configuration for wrapping files that contain global variables.
     */
    externalWrapper?: {

        /**
         * Whether to enable the wrapper.
         */
        enable: boolean;

        /**
         * Content to be added at the top of the wrapper.
         */
        banner: string;

        /**
         * Content to be added at the bottom of the wrapper.
         */
        footer: string;
    };

    /**
     * Enable logging. Default: false.
     */
    log?: boolean;
}

export function WPViteBundler(userOptions: Partial<WPViteBundlerOptions>, mode: string): Partial<Plugin> {
    let viteConfig: ResolvedConfig;

    const options: WPViteBundlerOptions = {
        ...{
            css: 'pcss',
            dependencies: [],
            wpDeps: true,
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
     * Creates the dependency list & cache buster.
     *
     * @param module
     * @param bundleOptions
     * @param dependencies
     */
    const createPhpAssetFile = (module: OutputChunk, bundleOptions: NormalizedOutputOptions, dependencies: string[]) => {
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
    const createDependencyArray = (module: OutputChunk, isInteractivity: boolean, globals: GlobalsOption, externals: string[]): string[] => {
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
    const createCodeWrappers = async (module: OutputChunk, externals: string[]) => {
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
                    const minifiedWrappedCode = await minify(wrappedCode, viteConfig.build.terserOptions as MinifyOptions);

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
    const setImportedCss = (module: OutputChunk) => {
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
    const setCSsOutPath = (bundle: OutputBundle) => {
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
    const removeEmptyCssComment = (module: OutputChunk) => {
        module.code = module.code.replace(/\/\*\s*empty css\s*\*\//g, '');
    }

    /**
     * Plugin hooks.
     */
    return {
        name: 'vite-wp-bundler',

        /**
         * Resolve config.
         *
         * @param resolvedConfig
         */
        configResolved(resolvedConfig) {
            viteConfig = resolvedConfig;
        },

        /**
         * Generate Bundle Hook.
         *
         * @param bundleOptions
         * @param bundle
         */
        async generateBundle(bundleOptions: NormalizedOutputOptions, bundle: OutputBundle) {
            const globals: GlobalsOption = getGlobalsFromConfig(viteConfig)

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
    };
}