const path     = require('path');
module.exports = {
  plugins: {
    'postcss-import':      {
      resolve(id, basedir) {
        if (id.startsWith('@components')) {
          return path.resolve(__dirname, 'tests/src/components', id.slice('@components'.length));
        }
        return path.resolve(basedir, id);
      },
    },
    'tailwindcss/nesting': {},
    tailwindcss:           {config: './tailwind.config.js'},

  },
};