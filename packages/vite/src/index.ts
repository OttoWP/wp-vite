import fs from "fs";
import fg from "fast-glob";
import path from "path";
import {deepMerge, varExport} from './helpers/object';
import {getGlobalsFromConfig} from "./helpers/globals";
import {buildConfig} from "./helpers/config";
import {flattenToStringArray} from "./helpers/arrays";
import {ParsedFilePath, parseFilePath} from './helpers/strings';
import {Plugin, ResolvedConfig, UserConfig} from "vite";
import {GlobalsOption, NormalizedInputOptions, SourceMap} from "rollup";
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
     * Asset types and their corresponding regex patterns.
     */
    assets: Record<string, RegExp>;

    /**
     * Enable log. Default is false.
     */
    log?: boolean;

    /**
     * Choose which folders to keep. Default is empty.
     */
    keepOutDir?: string[];

    /**
     * The path to the manifest in the output directory.
     */
    manifest?: string;

    /**
     * Whether to include a PHP version of the manifest in addition to the JSON file.
     */
    phpManifest?: boolean;
}

function WPVite(userOptions: Partial<WPViteOptions> = {}): Partial<Plugin> {
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
            keepOutDir: [],
        },
        userOptions
    )

    /**
     * Empties out dir with rules.
     *
     * @param config
     * @param options
     */
    const emptyOutDir = (config: ResolvedConfig, options: WPViteOptions) => {
        const outDir = path.resolve(config.root, config.build.outDir);
        const deleted = [];

        if (!fs.existsSync(outDir)) return;

        for (const item of fs.readdirSync(outDir, {withFileTypes: true})) {
            const itemPath = path.join(outDir, item.name);

            if (Array.isArray(options.keepOutDir) && !options.keepOutDir.includes(item.name)) {
                if (item.isDirectory()) {
                    fs.rmSync(itemPath, {recursive: true, force: true});
                } else if (item.isFile()) {
                    fs.unlinkSync(itemPath);
                }
                deleted.push(itemPath)
            }
        }
    }

    /**
     * Gathers assets (images, svg, fonts) per provided regex rules
     *
     * @param config
     */
    const collectAssets = (config: ResolvedConfig) => {
        const assets: Record<string, string[]> = {};

        // Group by asset type.
        for (const key in options.assets) {
            if (!assets[key]) {
                assets[key] = fg.sync([path.resolve(config.root, '**', key, '**')]);
            }
        }

        return assets
    };

    /**
     * Gather resources from entries (PHP, JSON etc.)
     */
    const collectResources = (): Record<string, string[]> | null => {
        const resources = flattenToStringArray(options.input.entries);
        const filtered = resources.filter(file => !file.endsWith('.js') && !file.endsWith(`.${options.css}`));
        const grouped: Record<string, string[]> = {};

        // Group by extension.
        filtered.forEach(entry => {
            const ext = path.extname(entry).toLowerCase();
            if (!grouped[ext]) grouped[ext] = [];
            grouped[ext].push(entry);
        });

        return grouped;
    };

    /**
     * Plugin hooks.
     */
    return {

        /**
         * Plugin name.
         */
        name: 'wp-vite',

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
         * Build Start Hook.
         */
        buildStart(buildOptions: NormalizedInputOptions) {
            emptyOutDir(viteConfig, options)

            const filePaths = {...(collectResources() ?? {}), ...(collectAssets(viteConfig) ?? {})};
            // Types.
            for (const type in filePaths) {
                if (!filePaths[type]) return;
                // File paths.
                filePaths[type].forEach(filePath => {
                    // Parse file path and create emit object.
                    const file = options.source(path.basename(viteConfig.root), filePath);
                    // Emit our assets & resources.
                    this.emitFile({
                        type: 'asset',
                        fileName: options.output(`${type}/[name][ext]`, file, file.ext)
                            .replace(/\[name\]/g, file.fileName)
                            .replace(/\[ext\]/g, `.${file.ext}`),
                        originalFileName: `${file.fileName}.${file.ext}`,
                        source: fs.readFileSync(file.path),
                        name: path.relative(path.resolve(viteConfig.root), file.path)
                    });
                });
            }
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