/** Export the shared frontend without copying any Next server routes into the build. */
import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Keep staging outside the checkout so TypeScript cannot recursively include it.
const stage = path.join(path.dirname(root), '.libretv-standalone-stage');
const output = path.join(root, 'standalone-out');
function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, {
    cwd, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_APP_MODE: 'standalone', NEXT_TELEMETRY_DISABLED: '1' },
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
symlinkSync(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
run([path.join(root, 'node_modules/next/dist/bin/next'), 'build'], stage);
rmSync(output, { recursive: true, force: true });
cpSync(path.join(stage, 'out'), output, { recursive: true });
writeFileSync(path.join(output, '_headers'), '/sw-standalone.js\n  Cache-Control: no-store\n  Service-Worker-Allowed: /\n/manifest.webmanifest\n  Cache-Control: no-cache\n/*\n  X-Content-Type-Options: nosniff\n');
run(['scripts/prepare-standalone-pwa.mjs', output]);
console.log(`Standalone iPhone PWA exported to ${output}; no Next API runtime is included.`);
