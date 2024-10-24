import {defineConfig} from 'vite';
import WPVite from '../dist/index';
import path from 'path';

export default defineConfig({
  root:    `tests/src`,
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/alias-components'),
    },
  },
  plugins: [
    WPVite( {
      input:  {
        entries:       [
          ['*', '*.js'],
          ['components', '*', '*.js'],
          ['randomPascalFolder', '**', '*.js'],
          ['blocks', '*', 'index.js'],
          ['blocks', '*', 'view.js'],
          ['blocks', '*', 'block.json'],
          ['blocks', '*', 'render.php'],
        ],
        interactivity: [
          ['blocks', 'example-interactivity-block', 'view.js'],
        ],
      },
      output: (output, source, ext) => {
        const baseFolder = source.folders[source.folders.length - 1];

        if (['images', 'fonts', 'svg'].includes(baseFolder)) {
          return `${baseFolder}/[name].${ext}`;
        }

        return `${source.outPath}/[name].${ext}`;
      },
      dependencies: (module) => module.name === 'index' ? ['react'] : [],
    })],
});