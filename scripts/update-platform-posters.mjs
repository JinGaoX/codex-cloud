/** Explicit maintenance command: cache small public posters; never fetch video/API credentials. */
import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'src/lib/platform-catalog-data.json');
const output = path.join(root, 'public/posters/platform');
const entries = JSON.parse(readFileSync(catalogPath, 'utf8'));
const MAX_BYTES = 3 * 1024 * 1024;
const allowedDomains = ['iqiyipic.com', 'ykimg.com', 'gtimg.cn', 'gtimg.com', 'qpic.cn', 'wetvinfo.com'];
function posterUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    !allowedDomains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new Error('Poster must use a reviewed official HTTPS image host');
  }
  return url;
}
mkdirSync(output, { recursive: true });
let bytes = 0;
const completed = new Map();
for (const entry of entries) {
  const url = posterUrl(entry.posterUrl);
  const file = `poster-${createHash('sha256').update(url.href).digest('hex').slice(0, 24)}.webp`;
  const destination = path.join(output, file);
  if (!completed.has(file) && existsSync(destination)) {
    const bytesOnDisk = readFileSync(destination);
    const size = await sharp(bytesOnDisk).metadata();
    if (size.format !== 'webp' || !size.width || !size.height) throw new Error(`Invalid existing poster for ${entry.title}`);
    completed.set(file, { width: size.width, height: size.height });
    bytes += bytesOnDisk.length;
  }
  if (!completed.has(file)) {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(15000) });
        break;
      } catch (error) {
        if (attempt === 1) throw new Error(`Poster request failed for ${entry.title}`, { cause: error });
      }
    }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Poster request failed for ${entry.title}: HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Poster exceeds size limit'); }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing poster body');
    const chunks = []; let total = 0;
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        total += part.value.byteLength;
        if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Poster exceeds size limit'); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const source = Buffer.concat(chunks);
    const metadata = await sharp(source, { limitInputPixels: 32_000_000 }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 100 || metadata.height < 80) throw new Error(`Invalid poster dimensions for ${entry.title}`);
    const optimized = await sharp(source, { limitInputPixels: 32_000_000 }).rotate().resize({ width: 420, height: 700, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    writeFileSync(`${destination}.tmp`, optimized); renameSync(`${destination}.tmp`, destination);
    const size = await sharp(optimized).metadata();
    bytes += optimized.length; completed.set(file, { width: size.width, height: size.height });
  }
  entry.posterFile = file;
  entry.posterWidth = completed.get(file).width;
  entry.posterHeight = completed.get(file).height;
}
writeFileSync(`${catalogPath}.tmp`, JSON.stringify(entries, null, 2) + '\n');
renameSync(`${catalogPath}.tmp`, catalogPath);
// Only this generated directory's stale hash-named thumbnails are removed.
// No private exports, source configuration or unrelated images are inspected.
for (const file of readdirSync(output)) {
  if (/^poster-[a-f0-9]{24}\.webp$/.test(file) && !completed.has(file)) unlinkSync(path.join(output, file));
}
console.log(`Bundled ${completed.size} public posters for ${entries.length} catalog entries (${bytes} bytes). No video was requested.`);
