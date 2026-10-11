// Builds dist/panel-designer-standalone.html — one file with all CSS/JS inlined.
// Handy for opening straight from a phone's file manager (no folder needed).
// Usage:  node tools/build-standalone.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
let html = read('index.html');

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) =>
  `<script>\n${read(src).replace(/<\/script/gi, '<\\/script')}\n</script>`);
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(/<link rel="icon" href="icon.svg"[^>]*>/,
  `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(read('icon.svg'))}">`);

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/panel-designer-standalone.html'), html);
console.log('dist/panel-designer-standalone.html', (html.length / 1024).toFixed(0) + ' KB');
