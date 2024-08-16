import path from 'path';
import fg from 'fast-glob';
import Globals from './helpers/globals';
import * as Vite from 'vite';
import * as Rollup from 'rollup';
import externalGlobals from 'rollup-plugin-external-globals';
import {ParsedFilePath, parseFilePath} from './helpers/strings';
import {wpViteEmptyDir} from './plugins/wp-vite-empty-dir';
import {wpViteBundler, WpViteBundlerOptions} from './plugins/wp-vite-bundler';
import {deepMerge} from './helpers/object';
import {flattenToStringArray} from "./helpers/arrays";
import {InputPluginOption} from "rollup";

export interface WpViteOptions extends WpViteBundlerOptions {
    dir?: string;
    css?: string;
    keepOutDir?: string[];
}


export default function wpVite(userOptions: WpViteOptions = {}): Vite.Plugin {
    const options: WpViteOptions = deepMerge(
        {
            dir: process.cwd(),
            css: 'pcss',
            input: {
                entries: [
                    ['*', '*.js'],
                    ['blocks', '*', 'index.js'],
                    ['blocks', '*', 'view.js'],
                    ['blocks', '*', 'block.json'],
                    ['blocks', '*', 'render.php'],
                ],
                interactivity: [],
            },
            source: (root: string, path: string) => parseFilePath(root, path),
            output: (output: string, source: ParsedFilePath, ext: string) => `${source.outPath}/[name].${ext}`,
        },
        userOptions
    )

    return {
        name: 'wp-vite',

        config: (config: Vite.UserConfig, {command, mode}) => ((() => {

            /**
             * root.
             */
            const root = config.root ?? 'src';

            // Resolve entry paths.
            (['entries', 'interactivity'] as const).forEach((entriesKey) => {
                if (options.input) {
                    options.input[entriesKey] = fg.sync(
                        options.input[entriesKey].map((pathPattern) => {
                            return options.dir ? path.resolve(options.dir, root, ...pathPattern) : ''
                        })
                    );
                }
            });

            /**
             * Globals.
             */
            const globals = !Array.isArray(config.build?.rollupOptions?.output)
                ? config.build?.rollupOptions?.output?.globals ?? Globals
                : Globals;

            /**
             * CSS Options.
             */
            const cssOptions: Vite.CSSOptions = {
                postcss: options.dir ? path.resolve(options.dir, './postcss.config.js') : '',
                devSourcemap: true
            }

            /**
             * Server options.
             */
            const serverOptions: Vite.ServerOptions = {
                host: '0.0.0.0',
                port: 3000,
            }

            /**
             * ESBuild Options.
             */
            const esBuildOptions: Vite.ESBuildOptions = {
                loader: 'jsx',
                include: new RegExp(`/${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/.*\\.js$`),
                exclude: [],
            }

            /**
             * Optimize Deps Options.
             */
            const optimizeDepsOptions: Vite.DepOptimizationOptions = {
                esbuildOptions: {loader: {'.js': 'jsx'}}, // Need JSX syntax for dev server
            }

            /**
             * Build Options.
             */
            const buildOptions: Vite.BuildOptions = {
                outDir: '../build',
                emptyOutDir: !(options.keepOutDir != null && options.keepOutDir.length > 0),
                manifest: true,
                target: 'es2015',
                minify: mode === 'development' ? false : 'terser',
                terserOptions: {
                    output: {
                        comments: /translators:/i,
                    },
                    compress: {
                        passes: 2,
                    },
                    mangle: {
                        reserved: ['__', '_n', '_nx', '_x'],
                    },
                },
                sourcemap: mode === 'development' || command === 'serve' ? 'inline' : false,
            }

            /**
             * Rollup Options.
             */
            const rollupOptions: Rollup.RollupOptions = {
                input: (() => options.input ? [
                    ...flattenToStringArray(options.input.entries),
                    ...flattenToStringArray(options.input.interactivity)
                ].filter(file => file.endsWith('.js')) : [])(),
                output: {
                    entryFileNames: (assetInfo) => {
                        if (assetInfo.facadeModuleId && options.output && options.source) {
                            return options.output(`js/[name].[hash].js`, options.source(root, assetInfo.facadeModuleId), 'js');
                        } else {
                            return `js/[name].[hash].js`
                        }
                    },
                    format: 'es',
                    globals: globals,
                },
                external: ['@wordpress/block-editor', '@wordpress/blocks', '@wordpress/i18n', '@wordpress/interactivity', 'react'],
            }

            /**
             * Rollup plugins.
             */
            const rollupPlugins: InputPluginOption = [
                // Ensures globals are NOT using "import" in the compiled files but are defined externally.
                externalGlobals(globals, {exclude: options.input ? flattenToStringArray(options.input.interactivity) : []}/*Make sure we ignore modules*/),

                // Ensures we can empty out the dir with rules in case the build folder is used for something else as well.
                wpViteEmptyDir(options),

                // Takes care of the whole bundle process for WP development.
                wpViteBundler(options, mode),
            ]

            if (!config.esbuild) {
                config.esbuild = {}
            }

            if (!config.build) {
                config.build = {}
            }

            if (!config.build.rollupOptions) {
                config.build.rollupOptions = {}
            }

            if (!config.build.rollupOptions.plugins) {
                config.build.rollupOptions.plugins = []
            }

            config.root = root;
            config.css = deepMerge(cssOptions, config.css ?? {});
            config.server = deepMerge(serverOptions, config.server ?? {})
            config.esbuild.loader = config.esbuild.loader ?? esBuildOptions.loader;
            config.esbuild.include = config.esbuild.include ?? esBuildOptions.include;
            config.esbuild.exclude = config.esbuild.exclude ?? esBuildOptions.exclude;
            config.optimizeDeps = deepMerge(optimizeDepsOptions, config.optimizeDeps ?? {})
            config.build.manifest = config.build.manifest ?? buildOptions.manifest;
            config.build.target = config.build.target ?? buildOptions.target;
            config.build.minify = config.build.minify ?? buildOptions.minify;
            config.build.outDir = config.build.outDir ?? buildOptions.outDir;
            config.build.emptyOutDir = config.build.emptyOutDir ?? buildOptions.emptyOutDir;
            config.build.sourcemap = config.build.sourcemap ?? buildOptions.sourcemap;
            config.build.terserOptions = config.build.terserOptions ?? buildOptions.terserOptions;
            config.build.rollupOptions.input = config.build.rollupOptions.input ?? rollupOptions.input;
            config.build.rollupOptions.output = config.build.rollupOptions.output ?? rollupOptions.output;
            config.build.rollupOptions.external = config.build.rollupOptions.external ?? rollupOptions.external;

            if (config.build.rollupOptions.plugins && Array.isArray(config.build.rollupOptions.plugins)) {
                config.build.rollupOptions.plugins = [...rollupPlugins, ...config.build.rollupOptions.plugins] as InputPluginOption;
            } else {
                config.build.rollupOptions.plugins = rollupPlugins;
            }
        })()),
    };
}
