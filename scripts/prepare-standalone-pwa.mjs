/** Run after Next's static export: inject an exact, versioned offline app manifest. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(process.argv[2] || path.join(root, 'standalone-out'));
if (!existsSync(path.join(directory, 'index.html'))) throw new Error('Static export index.html is missing');
const files = [];
const walk = (folder) => {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(path.relative(directory, full).split(path.sep).join('/'));
  }
};
walk(directory);
const allowed = files.filter((name) =>
  // RSC .txt payloads are static generated application code; never cache .map files or source archives.
  (/^_next\/static\/.*\.(?:js|css|woff2?|ttf)$/.test(name) ||
   /^(?:[^/]+\/)*[^/]+\.(?:html|txt)$/.test(name) ||
   /^icons\/[^/]+\.(?:png|svg|ico)$/.test(name) ||
   ['favicon.ico', 'player-poster.png', 'manifest.webmanifest'].includes(name)) &&
  !name.startsWith('api/') && !name.endsWith('.map')
).sort();
const precache = allowed.map((name) => ({
  url: `/${name}`,
  sha256: createHash('sha256').update(readFileSync(path.join(directory, name))).digest('hex'),
}));
const routes = {};
for (const name of allowed.filter((name) => name.endsWith('.html') && name !== 'offline.html')) {
  let route = `/${name.slice(0, -5)}`;
  if (route.endsWith('/index')) route = route.slice(0, -6) || '/';
  const txt = name.replace(/\.html$/, '.txt');
  routes[route] = { html: `/${name}`, ...(allowed.includes(txt) ? { rsc: `/${txt}` } : {}) };
}
const version = createHash('sha256').update(JSON.stringify(precache)).digest('hex').slice(0, 20);
const worker = readFileSync(path.join(root, 'public/sw-standalone.js'), 'utf8')
  .replace('__LIBRETV_STANDALONE_BUILD__', version)
  .replace('/*__LIBRETV_STANDALONE_PRECACHE__*/ []', JSON.stringify(precache))
  .replace('/*__LIBRETV_STANDALONE_ROUTES__*/ {}', JSON.stringify(routes));
writeFileSync(path.join(directory, 'sw-standalone.js'), worker);
console.log(`Prepared offline app ${version}: ${precache.length} public resources, ${Object.keys(routes).length} routes.`);
