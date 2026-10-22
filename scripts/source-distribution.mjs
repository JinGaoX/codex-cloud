// Generate the modified program's public source offer for AGPL deployments.
// Deliberately allowlist project source: never archive .git, env files, runtime
// exports, private API configuration, node_modules, caches, or build output.
import { existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  'src', 'public', 'docs', 'scripts', '.github', 'LICENSE', 'README.md',
  'CHANGELOG.private.zh-CN.md', 'UPSTREAM.md', 'package.json', 'package-lock.json',
  'next.config.ts', 'next-env.d.ts', 'tsconfig.json', 'tailwind.config.ts',
  'postcss.config.mjs', 'eslint.config.mjs', 'vitest.config.ts', 'vercel.json',
  'Dockerfile', 'docker-compose.yml', '.dockerignore', '.gitignore', '.env.example',
].filter((entry) => existsSync(path.join(root, entry)));
mkdirSync(path.join(root, 'public'), { recursive: true });
const result = spawnSync('tar', [
  '--exclude=public/source-code.tar.gz', '--exclude=*.local', '--exclude=*.log',
  '--exclude=.DS_Store', '-czf', 'public/source-code.tar.gz', ...entries,
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
console.log('Generated public/source-code.tar.gz from public source allowlist.');
