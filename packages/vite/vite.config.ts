import {defineConfig} from "vite";
import typescript from "@rollup/plugin-typescript";
import {typescriptPaths} from "rollup-plugin-typescript-paths";
import path from "path";

export default defineConfig({
    build: {
        manifest: false,
        minify: true,
        reportCompressedSize: true,
        emptyOutDir: true,
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