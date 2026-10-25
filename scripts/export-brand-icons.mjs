/** Export app-size PNGs and ICO from the approved original square artwork. Requires ImageMagick. */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] && path.resolve(process.argv[2]);
if (!input || !existsSync(input)) throw new Error('Usage: node scripts/export-brand-icons.mjs /absolute/path/to/original-icon.png');
const icons = path.join(root, 'public/icons');
mkdirSync(icons, { recursive: true });
const run = (args) => {
  const result = spawnSync('magick', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Icon export failed');
};
for (const size of [48, 96, 144, 192, 512]) {
  run([input, '-resize', `${size}x${size}!`, '-strip', path.join(icons, `vip-icon-${size}.png`)]);
}
run([input, '-resize', '180x180!', '-strip', path.join(icons, 'vip-apple-touch-icon.png')]);
run([input, '-resize', '512x512!', '-strip', path.join(root, 'public/player-poster.png')]);
run([input, '-resize', '1024x1024!', '-strip', path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')]);
run([input, '-resize', '48x48!', '-strip', '-define', 'icon:auto-resize=48,32,16', path.join(root, 'public/favicon.ico')]);
for (const filename of ['icon-48.png', 'icon-96.png', 'icon-144.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  rmSync(path.join(icons, filename), { force: true });
}
console.log('Exported original VIP影视 artwork for web/PWA and the retained native project.');
