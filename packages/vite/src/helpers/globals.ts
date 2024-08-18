import {camelToKebab} from './strings';
import {ResolvedConfig, UserConfig} from "vite";
import {GlobalsOption} from "rollup";

const otherModules: GlobalsOption = {
  'jquery':    'jQuery',
  'tinymce':   'tinymce',
  'moment':    'moment',
  'react':     'React',
  'react-dom': 'ReactDOM',
  'backbone':  'Backbone',
  'lodash':    'lodash',
};

const wpModules: string[] = [
  'a11y',
  'annotations',
  'api-fetch',
  'autop',
  'blob',
  'block-directory',
  'block-editor',
  'block-library',
  'block-serialization-default-parser',
  'blocks',
  'components',
  'compose',
  'core-data',
  'customize-widgets',
  'data',
  'data-controls',
  'date',
  'deprecated',
  'dom',
  'dom-ready',
  'edit-post',
  'edit-site',
  'edit-widgets',
  'editor',
  'element',
  'escape-html',
  'format-library',
  'hooks',
  'html-entities',
  'i18n',
  'is-shallow-equal',
  'interactivity',
  'keyboard-shortcuts',
  'keycodes',
  'list-reusable-blocks',
  'media-utils',
  'notices',
  'nux',
  'plugins',
  'preferences',
  'preferences-persistence',
  'primitives',
  'priority-queue',
  'redux-routine',
  'reusable-blocks',
  'rich-text',
  'server-side-render',
  'shortcode',
  'style-engine',
  'token-list',
  'url',
  'viewport',
  'warning',
  'widgets',
  'wordcount',
];

const globals: GlobalsOption = {
  ...otherModules,
  ...Object.fromEntries(
      wpModules.map(handle => [`@wordpress/${handle}`, `wp.${camelToKebab(handle)}`]),
  ),
}

export default globals;

export const getGlobalsFromConfig = (config: UserConfig | ResolvedConfig): GlobalsOption => {
  return !Array.isArray(config.build?.rollupOptions?.output)
      ? config.build?.rollupOptions?.output?.globals ?? globals
      : globals;
}