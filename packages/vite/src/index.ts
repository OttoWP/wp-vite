import fs from "fs";
import fg from "fast-glob";
import path from "path";
import {deepMerge, varExport} from './helpers/object';
import {getGlobalsFromConfig} from "./helpers/globals";
import {buildConfig} from "./helpers/config";
import {flattenToStringArray} from "./helpers/arrays";
import {ParsedFilePath, parseFilePath} from './helpers/strings';
import {PluginOption, ResolvedConfig, UserConfig} from "vite";
import {GlobalsOption, SourceMap} from "rollup";
import {WPViteBundler, WPViteBundlerOptions} from "./plugins/wp-vite-bundler";
import externalGlobals from "rollup-plugin-external-globals";

export interface WPViteOptions extends WPViteBundlerOptions {

    /**
     * Set the plugins root dir.
     */
    dir: string;

    /**
     * Set CSS extension. Default is pcss.
     */
    css: string;

    /**
     * Enable log. Default is false.
     */
    log?: boolean;

    /**
     * The path to the manifest in the output directory.
     */
    manifest?: string;

    /**
     * Whether to include a PHP version of the manifest in addition to the JSON file.
     */
    phpManifest?: boolean;
}

function WPVite(userOptions: Partial<WPViteOptions> = {}): Partial<PluginOption> {
    let viteConfig: ResolvedConfig;
    let viteGlobals: GlobalsOption;

    const options: WPViteOptions = deepMerge(
        {
            dir: process.cwd(),
            css: 'pcss',
            assets: {
                images: /png|jpe?g|gif|tiff|bmp|ico/i,
                svg: /\.svg$/i,
                fonts: /ttf|woff|woff2/i,
            },
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
            manifest: '.vite/manifest.json',
            phpManifest: false,
            log: false,
        },
        userOptions
    )

    /**
     * Plugin hooks.
     */
    return {
        name: 'wp-vite',
        enforce: "pre",

        /**
         * Config hook.
         */
        config: (config: UserConfig, {command, mode}) => ((() => {
            const root = config.root ?? (config.root = 'src');
            // Set globals from config.
            viteGlobals = getGlobalsFromConfig(config);
            // Resolve entry paths.
            (['entries', 'interactivity'] as const).forEach((entriesKey) => {
                options.input[entriesKey] = fg.sync(
                    options.input[entriesKey].map((pathPattern) => path.resolve(options.dir, root, ...pathPattern))
                );
            });
            // Pre-configures the config for WP development.
            config = buildConfig(config, options, viteGlobals, command, mode);

            // Add rollup plugins.
            if (Array.isArray(config.build?.rollupOptions?.plugins)) {
                const rollupPlugins = config.build?.rollupOptions?.plugins;

                // Ensures globals are NOT using "import" in the compiled files but are defined externally.
                rollupPlugins.push(externalGlobals(viteGlobals, {
                        exclude: flattenToStringArray(options.input.interactivity) /*Make sure we ignore modules*/
                    }
                ))
                // Takes care of the whole bundle process on the Rollup level.
                rollupPlugins.push(WPViteBundler(options, mode) as Plugin)
            }
        })()),

        /**
         * Config Resolved Hook.
         *
         * @param resolvedConfig
         */
        configResolved(resolvedConfig: ResolvedConfig) {
            const VALID_ID_PREFIX = `/@id/`;
            const reg = new RegExp(
                `${VALID_ID_PREFIX}(${Object.keys(viteGlobals).join("|")})`,
                "g"
            );
            /**
             * Push a late plugin to rewrite the 'vite:import-analysis' prefix.
             * Inspired by {@url https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717}
             */
            if (resolvedConfig.plugins && Array.isArray(resolvedConfig.plugins)) {
                resolvedConfig.plugins.push({
                    name: "wp-vite-ignore-static-import-replace-idprefix",
                    transform(code: string) {
                        if (reg.test(code)) {
                            const transformedCode = code.replace(reg, (m, s1) => s1);
                            const map: SourceMap | null = this.getCombinedSourcemap?.() || null;

                            return {code: transformedCode, map};
                        }

                        return null
                    },
                });
            }
            // Set the resolved config.
            viteConfig = resolvedConfig;
        },

        /**
         * ResolveID hook.
         *
         * @param id
         */
        resolveId(id: string) {
            /**
             * Rewrite the id from our static imports before 'vite:resolve' plugin
             * transform to 'node_modules/...' during dev server.
             * Inspired by {@url https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717}
             */
            if (Object.keys(viteGlobals).includes(id)) {
                return {id, external: true};
            }
        },

        /**
         * Load hook.
         *
         * @param id
         */
        load(id: string) {
            /**
             * Prevents errors in console logs during dev server when doing static import.
             * Inspired by {@url https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717}
             */
            if (Object.keys(viteGlobals).includes(id)) {
                return '';
            }
        },


        /**
         * Close Bundle hook.
         */
        closeBundle() {
            if (options.phpManifest && options.manifest) {
                // Path to the manifest file.
                const manifestPath = path.resolve(viteConfig.root, viteConfig.build.outDir, options.manifest);
                // Create the PHP manifest if enabled.
                if (fs.existsSync(manifestPath)) {
                    fs.writeFileSync(
                        path.resolve(path.dirname(manifestPath), 'manifest.php'),
                        `<?php\n\nreturn ${varExport(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')))};\n`,
                        'utf-8'
                    );
                }
            }
        },

        /**
         * Handle Hot Update Hook.
         *
         * @param file
         * @param server
         * @param modules
         */
        handleHotUpdate({file, server, modules}) {
            // Handle hot update for PHP files.
            if (file.endsWith('.php')) {
                server.ws.send({type: 'full-reload', path: '*'});
            }
        },
    };
}

export default WPVite