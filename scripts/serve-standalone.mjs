/** Local static preview only. This does not provide a search or media proxy API. */
import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const native = process.argv.includes('--native');
const pages = process.argv.includes('--pages');
if (native && pages) throw new Error('--native and --pages are separate preview targets.');
const basePath = pages ? (process.env.NEXT_PUBLIC_APP_BASE_PATH || '/codex-cloud') : '';
if (basePath && (!/^\/(?:[A-Za-z0-9_~.-]+)(?:\/[A-Za-z0-9_~.-]+)*$/.test(basePath)
  || basePath.split('/').some((part) => part === '.' || part === '..'))) {
  throw new Error('Invalid Pages preview base path.');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), native ? '../native-dist' : pages ? '../pages-dist' : '../out');
const port = Number(process.env.STANDALONE_PORT || 8080);
const host = process.env.STANDALONE_HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.txt': 'text/x-component',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.gz': 'application/gzip', '.mobileconfig': 'application/x-apple-aspen-config' };
if (!existsSync(path.join(root, 'index.html'))) throw new Error(`Run npm run ${native ? 'build:native' : pages ? 'build:pages' : 'build:iphone'} first.`);
const server = http.createServer((req, res) => {
  let pathname;
  let parsed;
  try { parsed = new URL(req.url, 'http://localhost'); pathname = decodeURIComponent(parsed.pathname); }
  catch { res.writeHead(400).end(); return; }
  if (basePath) {
    if (pathname === basePath) {
      res.writeHead(308, { Location: basePath + '/' + parsed.search }).end(); return;
    }
    if (!pathname.startsWith(basePath + '/')) { res.writeHead(404).end('Not found'); return; }
    pathname = pathname.slice(basePath.length);
  }
  const target = path.resolve(root, '.' + pathname);
  if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (pages && !pathname.endsWith('/') && existsSync(target) && statSync(target).isDirectory()) {
    res.writeHead(308, { Location: basePath + pathname + '/' + parsed.search }).end(); return;
  }
  const options = pathname === '/' ? [path.join(root, 'index.html')]
    : [target, target + '.html', path.join(target, 'index.html')];
  const file = options.find((item) => existsSync(item) && statSync(item).isFile());
  if (!file) { res.writeHead(404).end('Not found'); return; }
  const size = statSync(file).size;
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start > end || start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
  const headers = { 'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
    'Cache-Control': file.endsWith('.js') && path.basename(file).startsWith('sw') ? 'no-store' : 'no-cache' };
  if (match) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  if (file.endsWith('.mobileconfig')) headers['Content-Disposition'] = 'attachment; filename="LibreTV.mobileconfig"';
  res.writeHead(match ? 206 : 200, headers);
  if (req.method === 'HEAD') res.end(); else createReadStream(file, { start, end }).pipe(res);
});
server.listen(port, host, () => console.log(`${native ? 'Native bundle browser preview (not WKWebView)' : pages ? 'GitHub Pages static preview' : 'Standalone static preview'}: http://${host}:${port}${basePath}/`));
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
