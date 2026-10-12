// Sets the version everywhere it lives, writes version.json (the file the
// app's update check reads) and rebuilds dist/. Nothing is written unless
// every place was found, so a half-bumped tree can't happen.
//
//   node tools/bump.mjs 2.13.0 "What changed" "Another thing"
//   node tools/bump.mjs            (prints the current version)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);
const [version, ...notes] = process.argv.slice(2);
const current = JSON.parse(read('package.json')).version;

if (!version) { console.log('current version', current); process.exit(0); }
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error('Version must look like 2.13.0'); process.exit(1); }
if (version !== current && !notes.length) {
  console.error('Give at least one note — they show up under "What\'s new" in Settings.');
  process.exit(1);
}

// Every pattern has two groups so the version slots in between them.
const places = [
  ['package.json', /("version":\s*")[^"]+(")/],
  ['manifest.webmanifest', /("version":\s*")[^"]+(")/],
  ['js/panel.js', /(const APP_VERSION=')[^']+(')/],
  ['README.md', /^(# DB Panel Designer — v)\d+\.\d+\.\d+()/m],
];

const next = [];
for (const [path, re] of places) {
  const text = read(path);
  if (!re.test(text)) { console.error('Could not find the version in ' + path + ' — nothing was changed.'); process.exit(1); }
  next.push([path, text.replace(re, (_, a, b) => a + version + b)]);
}

let prev = {};
try { prev = JSON.parse(read('version.json')); } catch { /* first run */ }
const d = new Date(), pad = n => String(n).padStart(2, '0');
const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keep = version === current && !notes.length;
const info = { version, date: keep ? prev.date || today : today, notes: notes.length ? notes : prev.notes || [] };

for (const [path, text] of next) write(path, text);
write('version.json', JSON.stringify(info, null, 2) + '\n');
console.log(`${current} -> ${version}`);
for (const [path] of next) console.log('  updated', path);
console.log('  wrote   version.json');

await import('./build-standalone.mjs');
