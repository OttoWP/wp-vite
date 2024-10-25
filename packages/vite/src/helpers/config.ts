import path from "path";
import {flattenToStringArray} from "./arrays";
import {GlobalsOption, PreRenderedAsset, PreRenderedChunk, RollupOptions} from "rollup";
import {UserConfig, BuildOptions, CSSOptions, DepOptimizationOptions, ESBuildOptions, ServerOptions} from "vite";
import {WPViteOptions} from "../index";
import {scanPathForExtensionFiles} from "./scan";


/**
 * Builds the config.
 *
 * @param config
 * @param options
 * @param globals
 * @param command
 * @param mode
 */
export const buildConfig = (config: UserConfig, options: WPViteOptions, globals: GlobalsOption, command: string, mode: string) => {
    const projectRootPath = path.resolve(options.dir, (config.root ?? ''))
    const projectCssFileMap = scanPathForExtensionFiles(projectRootPath, options.css);

    /**
     * CSS Options.
     */
    const cssOptions: CSSOptions = {
        postcss: options.dir ? path.resolve(options.dir, './postcss.config.js') : '',
        devSourcemap: true
    }

    /**
     * Server options.
     */
    const serverOptions: ServerOptions = {
        host: '0.0.0.0',
        port: 3000,
    }

    /**
     * ESBuild Options.
     */
    const esBuildOptions: ESBuildOptions = {
        loader: 'jsx',
        include: config.root ? new RegExp(
            `${config.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\/.*\\.(js|jsx|ts|tsx)$`
        ) : [],
        exclude: [],
    }

    /**
     * Optimize Deps Options.
     */
    const optimizeDepsOptions: DepOptimizationOptions = {
        esbuildOptions: {
            loader: {'.js': 'jsx'} /** Need JSX syntax for dev server */
        },
        exclude: Object.keys(globals), /** Prevent pre-transform of globals during dev server. {@url https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717} */
    }

    /**
     * Build Options.
     */
    const buildOptions: BuildOptions = {
        outDir: '../build',
        emptyOutDir: !(options.keepOutDir != null && options.keepOutDir.length > 0),
        manifest: true,
        target: 'es2015',
        minify: mode === 'development' ? false : 'terser',
        assetsInlineLimit: 0,
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
    const rollupOptions: RollupOptions = {
        input: (() => options.input ? [
            ...flattenToStringArray(options.input.entries),
            ...flattenToStringArray(options.input.interactivity)
        ].filter(file => file.endsWith('.js')) : [])(),
        output: {
            entryFileNames: (assetInfo) => {
                if (config.root && options.output && options.source && assetInfo.facadeModuleId) {
                    return options.output(`js/[name].[hash].js`, options.source(config.root, assetInfo.facadeModuleId), 'js');
                } else {
                    return `js/[name].[hash].js`
                }
            },
            chunkFileNames: (chunkInfo: PreRenderedChunk) => {
                if (config.root && options.output && options.source && chunkInfo.moduleIds && chunkInfo.moduleIds[0]) {
                    return options.output(`js/[name].[hash].js`, options.source(config.root, chunkInfo.moduleIds[0]), 'js');
                } else {
                    return  'js/[name].[hash].js';
                }
            },
            assetFileNames: (assetInfo: PreRenderedAsset) => {
                if (config.root) {
                    for (const [key, value] of Object.entries(projectCssFileMap)) {
                        const fileContents = value + '/*$vite$:1*/';
                        const relativePath = key.replace(projectRootPath, "").slice(1);
                        const folderPath = path.dirname(relativePath)

                        if (fileContents === assetInfo.source) {
                            return `${folderPath}/[name][extname]`
                        }
                    }
                }
                return "assets/[name].hash[hash][extname]" //Prefixed with "hash" intentionally for easier splitting
            },
            format: 'es',
            globals: globals,
            generatedCode: 'es2015'
        },
        external: Object.keys(globals),
    }

    /**
     * Build the overridable config.
     *
     * @param config
     */
    const build = (config: UserConfig) => {
        config.css = {...cssOptions, ...(config.css ?? {})};
        config.server = config.server || {};
        config.server.host = config.server.host ?? serverOptions.host;
        config.server.port = config.server.port ?? serverOptions.port;
        config.optimizeDeps = config.optimizeDeps || {};
        config.optimizeDeps.exclude = [...(config.optimizeDeps?.exclude ?? []), ...(optimizeDepsOptions.exclude ?? [])]
        config.optimizeDeps.esbuildOptions = config.optimizeDeps.esbuildOptions || {};
        config.optimizeDeps.esbuildOptions.loader = {...(config.optimizeDeps.esbuildOptions.loader ?? {}), ...optimizeDepsOptions.esbuildOptions?.loader}
        config.esbuild = config.esbuild || {};
        config.esbuild.loader = config.esbuild.loader ?? esBuildOptions.loader;
        config.esbuild.include = config.esbuild.include ?? esBuildOptions.include;
        config.esbuild.exclude = config.esbuild.exclude ?? esBuildOptions.exclude;
        config.build = config.build || {};
        config.build.manifest = config.build.manifest ?? buildOptions.manifest;
        config.build.target = config.build.target ?? buildOptions.target;
        config.build.minify = config.build.minify ?? buildOptions.minify;
        config.build.outDir = config.build.outDir ?? buildOptions.outDir;
        config.build.emptyOutDir = config.build.emptyOutDir ?? buildOptions.emptyOutDir;
        config.build.sourcemap = config.build.sourcemap ?? buildOptions.sourcemap;
        config.build.terserOptions = config.build.terserOptions ?? buildOptions.terserOptions;
        config.build.rollupOptions = config.build.rollupOptions || {};
        config.build.rollupOptions.input = config.build.rollupOptions.input ?? rollupOptions.input;
        config.build.rollupOptions.output = config.build.rollupOptions.output ?? rollupOptions.output;
        config.build.rollupOptions.external = config.build.rollupOptions.external ?? rollupOptions.external;
        config.build.rollupOptions.plugins = config.build.rollupOptions.plugins || [];

        return config;
    }


    return build(config);
}