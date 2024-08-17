import {defineConfig, UserConfig} from "vite";
import typescript from "@rollup/plugin-typescript";
import {typescriptPaths} from "rollup-plugin-typescript-paths";
import path from "path";

export default defineConfig({
    build: {
        manifest: false,
        minify: false,
        reportCompressedSize: true,
        emptyOutDir: true,
        esbuild: {
            minify: false,
            minifyWhitespace: false,
            minifyIdentifiers: false,
            minifySyntax: false,
        },
        lib: {
            entry: path.resolve(__dirname, "src/index.ts"),
            fileName: "index",
            formats: ["es", "cjs"],
        },
        rollupOptions: {
            external: ['fast-glob', 'fs', 'path', 'crypto', 'terser', 'rollup-plugin-external-globals'],
            plugins: [
                typescriptPaths({
                    preserveExtensions: true,
                }),
                typescript({
                    sourceMap: false,
                    declaration: true,
                    outDir: "dist",
                }),
            ],
        },
    },
});