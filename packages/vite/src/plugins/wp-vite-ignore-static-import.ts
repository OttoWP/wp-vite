import * as Vite from 'vite';

/**
 * Inspired by {@url https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717}
 *
 * @param importKeys
 */
export function wpViteIgnoreStaticImport(importKeys: string[] = []): Vite.PluginOption {
    return {
        name: 'vite-ignore-static-import',
        enforce: "pre",

        /**
         * Config hook.
         *
         * @param config
         */
        config(config: Vite.UserConfig) {
            // 1. Insert to optimizeDeps.exclude to prevent pre-transform
            config.optimizeDeps = {
                ...(config.optimizeDeps ?? {}),
                exclude: [...(config.optimizeDeps?.exclude ?? []), ...importKeys],
            };
        },

        /**
         * Config resolved hook.
         *
         * @param resolvedConfig
         */
        configResolved(resolvedConfig: Vite.ResolvedConfig) {
            // 2. Push a plugin to rewrite the 'vite:import-analysis' prefix
            const VALID_ID_PREFIX = `/@id/`;
            const reg = new RegExp(
                `${VALID_ID_PREFIX}(${importKeys.join("|")})`,
                "g"
            );
            if (resolvedConfig.plugins && Array.isArray(resolvedConfig.plugins)) {
                resolvedConfig.plugins.push({
                    name: "vite-plugin-ignore-static-import-replace-idprefix",
                    transform: (code: string) => reg.test(code) ? code.replace(reg, (m, s1) => s1) : code,
                });
            }
        },

        /**
         * ResolveID hook.
         *
         * @param id
         */
        resolveId: (id: string) => {
            // 3. rewrite the id before 'vite:resolve' plugin transform to 'node_modules/...'
            if (importKeys.includes(id)) {
                return {id, external: true};
            }
        },

        /**
         * Load hook.
         *
         * @param id
         */
        load(id: string) {
            // 4. Prevents errors in console logs.
            if (importKeys.includes(id)) {
                return '';
            }
        }
    }
}