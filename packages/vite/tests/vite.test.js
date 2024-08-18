import {execSync} from 'child_process';
import fs from 'fs';
import path from 'path';

describe('Test expected generated build files & contents', () => {
  const rootDir  = path.resolve(__dirname, '../'); // Root directory of the project
  const buildDir = path.join(rootDir, 'tests/build'); // Build output directory
  const isDist   = process.env.NODE_ENV === 'dist';

  beforeAll(() => {
    execSync(
        (isDist ? 'yarn test-build-dist' : 'yarn test-build'),
        {cwd: rootDir, stdio: 'inherit'},
    );
  });

  it('should generate the expected frontend files with alias component', () => {
    const frontendJsFile  = path.join(buildDir, 'frontend', 'frontend.js');
    const frontendCssFile = path.join(buildDir, 'frontend', 'frontend.css');

    expect(fs.existsSync(frontendJsFile)).toBe(true);
    expect(fs.existsSync(frontendCssFile)).toBe(true);

    const jsContent  = fs.readFileSync(frontendJsFile, 'utf-8');
    const cssContent = fs.readFileSync(frontendCssFile, 'utf-8');

    expect(jsContent).toContain('\'use strict\';console.log("I\'m a component that will be bundled with the main script."),console.log("I\'m the main script.");');
    expect(cssContent).toContain('.im-a-component{color:#00f}.im-alias-component{color:#fff}.im-the-main-style{color:red}.im-the-main-style__nested{color:green}');
  });

  it('should generate the expected asset files', () => {
    [
      path.join(buildDir, 'fonts', 'SourceSerif4Variable-Italic.ttf.woff2'),
      path.join(buildDir, 'fonts', 'SourceSerif4Variable-Roman.ttf.woff2'),
      path.join(buildDir, 'svg', 'instagram.svg'),
      path.join(buildDir, 'svg', 'linkedin.svg'),
      path.join(buildDir, 'images', 'bird-on-black.jpg'),
      path.join(buildDir, 'images', 'bird-on-gray.jpg'),
      path.join(buildDir, 'images', 'bird-on-green.jpg'),
      path.join(buildDir, 'images', 'bird-on-salmon.jpg'),
    ].forEach(assetPath => expect(fs.existsSync(assetPath)).toBe(true));
  });

  it('should generate the expected dynamic block files', () => {
    const blockJson = path.join(buildDir, 'blocks', 'example-block', 'block.json');
    const indexCss  = path.join(buildDir, 'blocks', 'example-block', 'index.css');
    const indexJs   = path.join(buildDir, 'blocks', 'example-block', 'index.js');
    const indexPhp  = path.join(buildDir, 'blocks', 'example-block', 'index.asset.php');
    const styleCss  = path.join(buildDir, 'blocks', 'example-block', 'style.css');
    const viewJs    = path.join(buildDir, 'blocks', 'example-block', 'view.js');
    const viewPhp   = path.join(buildDir, 'blocks', 'example-block', 'view.asset.php');
    const renderPhp = path.join(buildDir, 'blocks', 'example-block', 'render.php');

    [blockJson, indexCss, indexPhp, indexJs, styleCss, viewJs, viewPhp, renderPhp].forEach(assetPath => expect(fs.existsSync(assetPath)).toBe(true));

    const blockJsonContent = fs.readFileSync(blockJson, 'utf-8');
    const indexPhpContent  = fs.readFileSync(indexPhp, 'utf-8');
    const indexCssContent  = fs.readFileSync(indexCss, 'utf-8');
    const indexJsContent   = fs.readFileSync(indexJs, 'utf-8');
    const renderPhpContent = fs.readFileSync(renderPhp, 'utf-8');
    const styleCssContent  = fs.readFileSync(styleCss, 'utf-8');
    const viewPhpContent   = fs.readFileSync(viewPhp, 'utf-8');
    const viewJsContent    = fs.readFileSync(viewJs, 'utf-8');

    expect(blockJsonContent).toContain('{\n' +
        '\t"$schema": "https://schemas.wp.org/trunk/block.json",\n' +
        '\t"apiVersion": 3,\n' +
        '\t"name": "create-block/example-blocks",\n' +
        '\t"version": "0.1.0",\n' +
        '\t"title": "Example Dynamic",\n' +
        '\t"category": "widgets",\n' +
        '\t"icon": "smiley",\n' +
        '\t"description": "Example dynamic block.",\n' +
        '\t"example": {},\n' +
        '\t"supports": {\n' +
        '\t\t"html": false\n' +
        '\t},\n' +
        '\t"textdomain": "example-blocks",\n' +
        '\t"editorScript": "file:./index.js",\n' +
        '\t"editorStyle": "file:./index.css",\n' +
        '\t"style": "file:./style-index.css",\n' +
        '\t"render": "file:./render.php",\n' +
        '\t"viewScript": "file:./view.js"\n' +
        '}\n');
    expect(indexPhpContent).toContain('<?php return array(\'dependencies\' => array(\'react\', \'wp-block-editor\', \'wp-blocks\', \'wp-i18n\' )');
    expect(indexCssContent).toContain('.wp-block-create-block-example-blocks{border:1px dotted #f00}');
    expect(indexJsContent).toContain(
        '(() => {\'use strict\';document.addEventListener("DOMContentLoaded",(()=>{if(wp.blockEditor,wp.blocks,"undefined"!==wp.i18n){var e=Object.defineProperty,o=Object.getOwnPropertySymbols,r=Object.prototype.hasOwnProperty,t=Object.prototype.propertyIsEnumerable,l=(o,r,t)=>r in o?e(o,r,{enumerable:!0,configurable:!0,writable:!0,value:t}):o[r]=t;wp.blocks.registerBlockType("create-block/example-blocks",{edit:function(){return React.createElement("p",((e,a)=>{for(var c in a||(a={}))r.call(a,c)&&l(e,c,a[c]);if(o)for(var c of o(a))t.call(a,c)&&l(e,c,a[c]);return e})({},wp.blockEditor.useBlockProps()),wp.i18n.__("Example Dynamic – hello from the editor!","example-blocks"))}})}else console.error("Required global variables [React, wp.blockEditor, wp.blocks, wp.i18n] are not available.")}));})();');
    expect(renderPhpContent).toContain('<p <?php echo get_block_wrapper_attributes(); ?>>\n' +
        '\t<?php esc_html_e( \'Example Dynamic – hello from a dynamic block!\', \'example-blocks\' ); ?>\n' +
        '</p>');
    expect(styleCssContent).toContain('.wp-block-create-block-example-blocks{background-color:#21759b;color:#fff;padding:2px}');
    expect(viewPhpContent).toContain('<?php return array(\'dependencies\' => array( )');
    expect(viewJsContent).toContain('(() => {\'use strict\';console.log("Hello World! (from create-block-example-blocks block)");\n})();');
  });

  it('should generate the expected interactivity block files', () => {
    const blockJson = path.join(buildDir, 'blocks', 'example-interactivity-block', 'block.json');
    const indexCss  = path.join(buildDir, 'blocks', 'example-interactivity-block', 'index.css');
    const indexJs   = path.join(buildDir, 'blocks', 'example-interactivity-block', 'index.js');
    const indexPhp  = path.join(buildDir, 'blocks', 'example-interactivity-block', 'index.asset.php');
    const styleCss  = path.join(buildDir, 'blocks', 'example-interactivity-block', 'style.css');
    const viewJs    = path.join(buildDir, 'blocks', 'example-interactivity-block', 'view.js');
    const viewPhp   = path.join(buildDir, 'blocks', 'example-interactivity-block', 'view.asset.php');
    const renderPhp = path.join(buildDir, 'blocks', 'example-interactivity-block', 'render.php');

    [blockJson, indexCss, indexPhp, indexJs, styleCss, viewJs, viewPhp, renderPhp].forEach(assetPath => expect(fs.existsSync(assetPath)).toBe(true));

    const blockJsonContent = fs.readFileSync(blockJson, 'utf-8');
    const indexPhpContent  = fs.readFileSync(indexPhp, 'utf-8');
    const indexCssContent  = fs.readFileSync(indexCss, 'utf-8');
    const indexJsContent   = fs.readFileSync(indexJs, 'utf-8');
    const renderPhpContent = fs.readFileSync(renderPhp, 'utf-8');
    const styleCssContent  = fs.readFileSync(styleCss, 'utf-8');
    const viewPhpContent   = fs.readFileSync(viewPhp, 'utf-8');
    const viewJsContent    = fs.readFileSync(viewJs, 'utf-8');

    expect(blockJsonContent).toContain('{\n' +
        '\t"$schema": "https://schemas.wp.org/trunk/block.json",\n' +
        '\t"apiVersion": 3,\n' +
        '\t"name": "create-block/example-interactivity",\n' +
        '\t"version": "0.1.0",\n' +
        '\t"title": "Example interactivity block",\n' +
        '\t"category": "widgets",\n' +
        '\t"icon": "smiley",\n' +
        '\t"description": "Example interactivity block.",\n' +
        '\t"example": {},\n' +
        '\t"supports": {\n' +
        '\t\t"html": false,\n' +
        '\t\t"interactivity": true\n' +
        '\t},\n' +
        '\t"textdomain": "example-blocks",\n' +
        '\t"editorScript": "file:./index.js",\n' +
        '\t"editorStyle": "file:./index.css",\n' +
        '\t"style": "file:./style.css",\n' +
        '\t"render": "file:./render.php",\n' +
        '\t"viewScriptModule": "file:./view.js",\n' +
        '\t"attributes": {\n' +
        '\t\t"price": {\n' +
        '\t\t\t"type": "number",\n' +
        '\t\t\t"default": 15\n' +
        '\t\t}\n' +
        '\t}\n' +
        '}');
    expect(indexPhpContent).toContain('<?php return array(\'dependencies\' => array(\'react\', \'wp-block-editor\', \'wp-blocks\', \'wp-components\', \'wp-i18n\' ),\'version\' =>');
    expect(indexCssContent).toContain('.wp-block-create-block-example-interactivity{border:1px dotted #f00}');
    expect(indexJsContent).toContain(
        '(() => {\'use strict\';document.addEventListener("DOMContentLoaded",(()=>{if(wp.blockEditor,wp.blocks,wp.components,"undefined"!==wp.i18n){var e=Object.defineProperty,t=Object.getOwnPropertySymbols,a=Object.prototype.hasOwnProperty,l=Object.prototype.propertyIsEnumerable,o=(t,a,l)=>a in t?e(t,a,{enumerable:!0,configurable:!0,writable:!0,value:l}):t[a]=l;wp.blocks.registerBlockType("create-block/example-interactivity",{edit:function({attributes:e,setAttributes:n}){const{price:r}=e,c=1e3,i=Math.floor(c/r);return React.createElement("div",((e,n)=>{for(var r in n||(n={}))a.call(n,r)&&o(e,r,n[r]);if(t)for(var r of t(n))l.call(n,r)&&o(e,r,n[r]);return e})({},wp.blockEditor.useBlockProps()),React.createElement(wp.blockEditor.InspectorControls,null,React.createElement(wp.components.PanelBody,{title:wp.i18n.__("Calculator settings")},React.createElement(wp.components.__experimentalNumberControl,{label:wp.i18n.__("Set the price for one tree"),help:wp.i18n.__("The value will be used for calculations."),value:r,min:1,onChange:e=>n({price:Number(e)})}))),React.createElement("form",{className:"calculator"},React.createElement("label",{for:"contribution-value",className:"calculator-label"},wp.i18n.__("Check the impact of your donation:")),React.createElement("div",{class:"calculator-input"},"$",React.createElement("input",{disabled:!0,value:c,className:"calculator-input-form",type:"number",id:"contribution-value"})),React.createElement("output",{className:"calculator-output"},[wp.i18n.__("Your "),React.createElement("span",null,"$",c),wp.i18n.__(" donation will enable us to plant "),React.createElement("span",null,i),wp.i18n.__(" trees.")])))}})}else console.error("Required global variables [React, wp.blockEditor, wp.blocks, wp.components, wp.i18n] are not available.")}));})();');
    expect(renderPhpContent).toContain('<?php\n' +
        '$attributes = $attributes ?? array();\n' +
        '$context = array(\n' +
        '    \'price\' => (int)$attributes[\'price\'],\n' +
        '    \'contribution\' => 0\n' +
        ');\n' +
        '?>\n' +
        '\n' +
        '<div\n' +
        '        data-wp-interactive="donation-calculator"\n' +
        '    <?php echo wp_interactivity_data_wp_context( $context ); ?>\n' +
        '    <?php echo get_block_wrapper_attributes(); ?>\n' +
        '>\n' +
        '    <form aria-label="<?php esc_attr_e( \'Calculate the impact of your donation.\' ); ?>" class="calculator">\n' +
        '        <label for="contribution-value" class="calculator-label"><?php esc_html_e( \'Check the impact of your donation:\' ); ?></label>\n' +
        '        <div class="calculator-input">$\n' +
        '            <input\n' +
        '                    data-wp-on--input="actions.calculate"\n' +
        '                    placeholder="0"\n' +
        '                    type="number"\n' +
        '                    id="contribution-value"\n' +
        '                    class="calculator-input-form"\n' +
        '            >\n' +
        '        </div>\n' +
        '        <output\n' +
        '                class="calculator-output"\n' +
        '                data-wp-class--show="state.show"\n' +
        '        >\n' +
        '            <?php\n' +
        '            echo sprintf(\n' +
        '                esc_html__( \'Your %s donation will enable us to plant %s trees.\' ),\n' +
        '                \'<span data-wp-text="state.donation"></span>\',\n' +
        '                \'<span data-wp-text="state.trees"></span>\'\n' +
        '            );?>\n' +
        '        </output>\n' +
        '    </form>\n' +
        '</div>');
    expect(styleCssContent).toContain(
        '.wp-block-create-block-example-interactivity{box-sizing:border-box;background-color:#ff0;color:#023a51;border:3px solid #023a51;border-radius:1.5rem;text-align:center;overflow:hidden}.wp-block-create-block-example-interactivity .calculator{padding:3rem 2rem}.wp-block-create-block-example-interactivity .calculator-input{margin:1.25rem auto;font-size:1.75rem;color:#023a51;display:flex;justify-content:center;align-items:center}.wp-block-create-block-example-interactivity .calculator-input-form{padding:.5rem 1rem;margin-left:.5rem;border:2px solid #023a51;border-radius:1rem;background-color:#fff;font-size:1.5rem;color:#023a51;max-width:130px}.wp-block-create-block-example-interactivity .calculator-output{display:none}.wp-block-create-block-example-interactivity .calculator-output.show{display:block}.wp-block-create-block-example-interactivity .calculator-output span{color:#f2fcf6;background:#0cab49;font-weight:700;border-radius:5px;padding:.25rem .5rem}\n');
    expect(viewPhpContent).toContain('<?php return array(\'dependencies\' => array(\'@wordpress/interactivity\' ),\'version\' =>');
    expect(viewJsContent).toContain(
        'import{store as t,getContext as o}from"@wordpress/interactivity";t("donation-calculator",{state:{get donation(){return`$${o().contribution}`},get trees(){const t=o();return Math.floor(t.contribution/t.price)},get show(){return o().contribution>0}},actions:{calculate:t=>{o().contribution=Number(t.target.value)}}});');
  });

  it('should generate the expected files from pascal folders', () => {
    const pascalCss = path.join(buildDir, 'random-pascal-folder', 'pascal-assets', 'pascal.css');
    const pascalJs  = path.join(buildDir, 'random-pascal-folder', 'pascal-assets', 'pascal-script.js');
    const pascalPhp = path.join(buildDir, 'random-pascal-folder', 'pascal-assets', 'pascal-script.asset.php');

    [pascalPhp, pascalCss, pascalJs].forEach(assetPath => expect(fs.existsSync(assetPath)).toBe(true));
  });

  it('should generate the expected manifest with correct included files', () => {
    const manifestFile = path.join(buildDir, '.vite', 'manifest.json');

    expect(fs.existsSync(manifestFile)).toBe(true);

    const manifestFileContent = fs.readFileSync(manifestFile, 'utf-8');

    expect(manifestFileContent).toContain('"blocks/example-block/index.js": {\n' +
        '    "file": "blocks/example-block/index.js",\n' +
        '    "name": "index",\n' +
        '    "src": "blocks/example-block/index.js",\n' +
        '    "isEntry": true,\n' +
        '    "assets": [\n' +
        '      "blocks/example-block/index.css",\n' +
        '      "blocks/example-block/style.css"\n' +
        '    ]\n' +
        '  },\n' +
        '  "blocks/example-block/render.php": {\n' +
        '    "file": "blocks/example-block/render.php",\n' +
        '    "src": "blocks/example-block/render.php"\n' +
        '  },\n' +
        '  "blocks/example-block/view.js": {\n' +
        '    "file": "blocks/example-block/view.js",\n' +
        '    "name": "view",\n' +
        '    "src": "blocks/example-block/view.js",\n' +
        '    "isEntry": true,\n' +
        '    "assets": [\n' +
        '      "blocks/example-block/style.css"\n' +
        '    ]\n' +
        '  },\n' +
        '  "blocks/example-interactivity-block/block.json": {\n' +
        '    "file": "blocks/example-interactivity-block/block.json",\n' +
        '    "src": "blocks/example-interactivity-block/block.json"\n' +
        '  },\n' +
        '  "blocks/example-interactivity-block/index.js": {\n' +
        '    "file": "blocks/example-interactivity-block/index.js",\n' +
        '    "name": "index",\n' +
        '    "src": "blocks/example-interactivity-block/index.js",\n' +
        '    "isEntry": true,\n' +
        '    "assets": [\n' +
        '      "blocks/example-interactivity-block/index.css",\n' +
        '      "blocks/example-interactivity-block/style.css"\n' +
        '    ]\n' +
        '  },\n' +
        '  "blocks/example-interactivity-block/render.php": {\n' +
        '    "file": "blocks/example-interactivity-block/render.php",\n' +
        '    "src": "blocks/example-interactivity-block/render.php"\n' +
        '  },\n' +
        '  "blocks/example-interactivity-block/view.js": {\n' +
        '    "file": "blocks/example-interactivity-block/view.js",\n' +
        '    "name": "view",\n' +
        '    "src": "blocks/example-interactivity-block/view.js",\n' +
        '    "isEntry": true,\n' +
        '    "assets": [\n' +
        '      "blocks/example-interactivity-block/style.css"\n' +
        '    ]\n' +
        '  },');
  });

  afterAll(() => {
    // Clean up the build directory
    fs.rmSync(buildDir, {recursive: true, force: true});
  });
});

describe('Test expected unminified files', () => {
  const rootDir  = path.resolve(__dirname, '../'); // Root directory of the project
  const buildDir = path.join(rootDir, 'tests/build'); // Build output directory

  beforeAll(() => {
    // Run yarn build from the root directory
    execSync('yarn test-build-dev', {cwd: rootDir, stdio: 'inherit'});
  });

  it('should generate the expected frontend unminified files', () => {
    const frontendJsFile  = path.join(buildDir, 'frontend', 'frontend.js');
    const frontendCssFile = path.join(buildDir, 'frontend', 'frontend.css');

    expect(fs.existsSync(frontendJsFile)).toBe(true);
    expect(fs.existsSync(frontendCssFile)).toBe(true);

    const jsContent  = fs.readFileSync(frontendJsFile, 'utf-8');
    const cssContent = fs.readFileSync(frontendCssFile, 'utf-8');

    expect(jsContent).toContain('(() => {\'use strict\';console.log("I\'m a component that will be bundled with the main script.");\n' +
        'console.log("I\'m the main script.");');
    expect(cssContent).toContain('.im-a-component{\n' +
        '    color: blue;\n' +
        '}\n' +
        '.im-alias-component {\n' +
        '    color: white;\n' +
        '}\n' +
        '.im-the-main-style {\n' +
        '    color: red;\n' +
        '}');
  });

  it('should generate the expected unminified interactivity block files', () => {
    const blockJson = path.join(buildDir, 'blocks', 'example-interactivity-block', 'block.json');
    const indexCss  = path.join(buildDir, 'blocks', 'example-interactivity-block', 'index.css');
    const indexJs   = path.join(buildDir, 'blocks', 'example-interactivity-block', 'index.js');
    const indexPhp  = path.join(buildDir, 'blocks', 'example-interactivity-block', 'index.asset.php');
    const styleCss  = path.join(buildDir, 'blocks', 'example-interactivity-block', 'style.css');
    const viewJs    = path.join(buildDir, 'blocks', 'example-interactivity-block', 'view.js');
    const viewPhp   = path.join(buildDir, 'blocks', 'example-interactivity-block', 'view.asset.php');
    const renderPhp = path.join(buildDir, 'blocks', 'example-interactivity-block', 'render.php');

    [blockJson, indexCss, indexPhp, indexJs, styleCss, viewJs, viewPhp, renderPhp].forEach(assetPath => expect(fs.existsSync(assetPath)).toBe(true));

    const indexCssContent = fs.readFileSync(indexCss, 'utf-8');
    const styleCssContent = fs.readFileSync(styleCss, 'utf-8');
    const viewJsContent   = fs.readFileSync(viewJs, 'utf-8');

    expect(indexCssContent).toContain('/**\n' +
        ' * The following styles get applied inside the editor only.\n' +
        ' *\n' +
        ' * Replace them with your own styles or remove the file completely.\n' +
        ' */\n' +
        '\n' +
        '.wp-block-create-block-example-interactivity {\n' +
        '\tborder: 1px dotted #f00;\n' +
        '}');
    expect(styleCssContent).toContain('/**\n' +
        ' * The following styles get applied both on the front of your site\n' +
        ' * and in the editor.\n' +
        ' *\n' +
        ' * Replace them with your own styles or remove the file completely.\n' +
        ' */\n' +
        '\n' +
        '.wp-block-create-block-example-interactivity {\n' +
        '\tbox-sizing: border-box;\n' +
        '\tbackground-color: yellow;\n' +
        '\tcolor: #023a51;\n' +
        '\tborder: 3px solid #023a51;\n' +
        '\tborder-radius: 1.5rem;\n' +
        '\ttext-align: center;\n' +
        '\toverflow: hidden;\n' +
        '}');
    expect(viewJsContent).toContain('import { store, getContext } from "@wordpress/interactivity";\n' +
        '\n' +
        'store("donation-calculator", {\n' +
        '  state: {\n' +
        '    get donation() {\n' +
        '      const context = getContext();\n' +
        '      return `$${context.contribution}`;\n' +
        '    },\n' +
        '    get trees() {\n' +
        '      const context = getContext();\n' +
        '      return Math.floor(context.contribution / context.price);\n' +
        '    },\n' +
        '    get show() {\n' +
        '      const context = getContext();\n' +
        '      return context.contribution > 0;\n' +
        '    }\n' +
        '  },\n' +
        '  actions: {\n' +
        '    calculate: (e) => {\n' +
        '      const context = getContext();\n' +
        '      context.contribution = Number(e.target.value);\n' +
        '    }\n' +
        '  }\n' +
        '});');
  });

  afterAll(() => {
    // Clean up the build directory
    fs.rmSync(buildDir, {recursive: true, force: true});
  });
});