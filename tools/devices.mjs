// Test helper for cloud sync: serves the app on several loopback ports. Each port is
// its own browser origin (its own localStorage), so each one behaves as a separate
// "device". /api/* is forwarded to the single `wrangler dev` backend.
//   node tools/devices.mjs [backendPort=8787] [devicePort ...=8790 8791 8792]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [backend = '8787', ...rest] = process.argv.slice(2);
const PORTS = rest.length ? rest.map(Number) : [8790, 8791, 8792];
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const headers = { ...req.headers, host: `127.0.0.1:${backend}` };
    const p = http.request({ host: '127.0.0.1', port: Number(backend), path: req.url, method: req.method, headers }, r => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    p.on('error', () => { res.writeHead(502, { 'content-type': 'application/json' }); res.end('{"error":"backend down"}'); });
    req.pipe(p);
    return;
  }
  const f = path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
  if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}

for (const port of PORTS) {
  http.createServer(handler).listen(port, '127.0.0.1', () => console.log(`device origin http://127.0.0.1:${port}/  ->  api on ${backend}`));
}
