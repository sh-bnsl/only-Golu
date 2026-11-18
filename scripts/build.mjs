// Builds single-file HTML pages for hosting (CDN / WebViews): three.js, main.js and
// helmet.js bundled, tree-shaken and minified, local assets/ inlined as data URIs,
// CSS inlined. No external requests.
//
//   npm install && npm run build:html →  dist/only-golu.html          (the demo page)
//                                       dist/only-golu.widget.html   (embed mode + noon bridge)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, process.argv[2] ?? 'dist');

const MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.json': 'application/json' };
const inlined = [];
const inlineAssets = (code) =>
  code.replace(/(["'`])((?:\.\/)?assets\/[^"'`\s]+)\1/g, (match, quote, assetPath) => {
    const file = resolve(root, assetPath);
    const mime = MIME_TYPES[extname(file).toLowerCase()];
    if (!mime || !existsSync(file)) return match;
    const data = readFileSync(file);
    inlined.push(`${assetPath} (${(data.length / 1024).toFixed(1)} KB)`);
    return `${quote}data:${mime};base64,${data.toString('base64')}${quote}`;
  });
const forScriptTag = (code) => code.replace(/<\/script/gi, '<\\/script');

const target = ['es2020', 'safari15', 'chrome90'];
const bundle = await esbuild.build({
  entryPoints: [resolve(root, 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  treeShaking: true,
  target,
  alias: { three: resolve(root, 'vendor/three.module.js') },
  legalComments: 'none',
  write: false,
  metafile: true,
  logLevel: 'warning',
});
const js = forScriptTag(inlineAssets(bundle.outputFiles[0].text));
const bridge = forScriptTag((await esbuild.transform(readFileSync(resolve(root, 'bridge/noon-bridge.js'), 'utf8'), { minify: true, target, legalComments: 'none' })).code);

const page = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = (await esbuild.transform(page.match(/<style>([\s\S]*?)<\/style>/)[1], { loader: 'css', minify: true })).code.trim();
const body = page
  .match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<script type="module" src="main\.js"><\/script>\s*/, '')
  .replace(/\s*\n\s*/g, '');
const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>only Golu</title>';
const license = '<!-- three.js (MIT) (c) 2010-2026 three.js authors -->';

const render = ({ before = '', after = '' }) =>
  `<!DOCTYPE html><html lang="en"><head>${head}<style>${css}</style></head><body>${body}${before}<script>${js}</script>${after}${license}</body></html>\n`;

const outputs = {
  'only-golu.html': render({}),
  'only-golu.widget.html': render({ before: '<script>window.goluConfig={embed:true};</script>', after: `<script>${bridge}</script>` }),
};

mkdirSync(outDir, { recursive: true });
Object.entries(outputs).forEach(([name, html]) => {
  writeFileSync(resolve(outDir, name), html);
  console.log(`${name}: ${(html.length / 1024).toFixed(1)} KB`);
});
inlined.forEach((asset) => console.log(`  inlined ${asset}`));
Object.entries(Object.values(bundle.metafile.outputs)[0].inputs).forEach(([file, info]) =>
  console.log(`  ${(info.bytesInOutput / 1024).toFixed(1).padStart(7)} KB  ${file.replace(`${root}/`, '')}`)
);
