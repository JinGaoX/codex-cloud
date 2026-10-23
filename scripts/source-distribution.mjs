// Generate the modified program's public source offer for AGPL deployments.
// Deliberately allowlist project source: never archive .git, env files, runtime
// exports, private API configuration, node_modules, caches, or build output.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  'src', 'public', 'docs', 'scripts', 'ios', 'capacitor.config.ts', '.github', 'LICENSE', 'README.md',
  'CHANGELOG.private.zh-CN.md', 'UPSTREAM.md', 'package.json', 'package-lock.json',
  'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'tailwind.config.ts',
  'postcss.config.mjs', 'eslint.config.mjs', 'vitest.config.ts', 'vercel.json',
  'Dockerfile', 'docker-compose.yml', '.dockerignore', '.gitignore', '.env.example',
].filter((entry) => existsSync(path.join(root, entry)));
mkdirSync(path.join(root, 'public'), { recursive: true });
// Build outside the archived tree, then replace atomically: parallel platform
// builds must not copy or serve a half-written corresponding-source offer.
const temporary = path.join(path.dirname(root), `.libretv-source-${process.pid}.tar.gz`);
const result = spawnSync('tar', [
  '--exclude=public/source-code.tar.gz', '--exclude=*.local', '--exclude=*.log',
  '--exclude=ios/App/App/public', '--exclude=ios/App/App/capacitor.config.json',
  '--exclude=ios/App/build', '--exclude=ios/DerivedData', '--exclude=xcuserdata',
  '--exclude=*.p12', '--exclude=*.mobileprovision', '--exclude=*.ipa',
  '--exclude=.DS_Store', '-czf', temporary, ...entries,
], { cwd: root, stdio: 'inherit' });
if (result.error || result.status !== 0) {
  rmSync(temporary, { force: true });
  if (result.error) throw result.error;
  process.exit(result.status || 1);
}
renameSync(temporary, path.join(root, 'public/source-code.tar.gz'));
console.log('Generated public/source-code.tar.gz from public source allowlist.');
