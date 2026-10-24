/** Export the shared frontend without copying any Next server routes into the build. */
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = process.argv.includes('--native');
const mode = native ? 'native' : 'standalone';
// Keep staging outside the checkout so TypeScript cannot recursively include it.
const stage = path.join(path.dirname(root), native ? '.libretv-native-stage' : '.libretv-standalone-stage');
const output = path.join(root, native ? 'native-dist' : 'out');
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_APP_MODE: mode, NEXT_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

run(['scripts/source-distribution.mjs']);
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
for (const entry of ['src', 'public', 'package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts',
  'tsconfig.json', 'tailwind.config.ts', 'postcss.config.mjs', 'eslint.config.mjs']) {
  if (existsSync(path.join(root, entry))) cpSync(path.join(root, entry), path.join(stage, entry), { recursive: true });
}
rmSync(path.join(stage, 'src/app/api'), { recursive: true, force: true });
// The current iPhone installer is Safari Add to Home Screen, with no profile.
rmSync(path.join(stage, 'public/LibreTV.mobileconfig'), { force: true });
if (native) {
  // A native app ships its shell; it has no website installer, hosting auth or SW update path.
  for (const name of ['install.html', 'LibreTV.mobileconfig', 'sw.js', 'sw-standalone.js', 'offline.html']) {
    rmSync(path.join(stage, 'public', name), { force: true });
  }
}
symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
run([path.join(root, 'node_modules/next/dist/bin/next'), 'build'], stage);
rmSync(output, { recursive: true, force: true });
cpSync(path.join(stage, 'out'), output, { recursive: true });
if (native) {
  writeFileSync(path.join(output, 'native-build.json'), JSON.stringify({
    mode: 'native', appId: 'org.libretv.personal', bundled: true, remoteServer: false,
  }, null, 2) + '\n');
  console.log(`Native local app exported to ${output}; bundle these files with Capacitor. No IPA has been compiled or signed.`);
} else {
  writeFileSync(path.join(output, '_headers'), '/sw-standalone.js\n  Cache-Control: no-store\n  Service-Worker-Allowed: /\n/manifest.webmanifest\n  Cache-Control: no-cache\n/*\n  X-Content-Type-Options: nosniff\n');
  run(['scripts/prepare-standalone-pwa.mjs', output]);
  console.log(`Standalone iPhone PWA exported to ${output}; no Next API runtime is included.`);
}
