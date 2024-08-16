import {defineConfig} from 'vite';
import wpVite from '../dist';
import path from 'path';

export default defineConfig({
  root:    `tests/src`,
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/alias-components'),
    },
  },
  plugins: [
    wpVite( {
      input:  {
        entries:       [
          ['*', '*.js'],
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
      dependencies: (module) => module.name === 'index' ? ['react'] : [],
    })],
});