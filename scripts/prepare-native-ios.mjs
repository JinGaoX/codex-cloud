/** Generate/sync the local iOS project; compiling and signing still require a Mac. */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const markerPath = path.join(root, 'native-dist/native-build.json');
if (!existsSync(markerPath) || JSON.parse(readFileSync(markerPath, 'utf8')).mode !== 'native') {
  throw new Error('Run npm run build:native before syncing the native iOS project.');
}
function cap(args) {
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/@capacitor/cli/bin/capacitor'), ...args], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!existsSync(path.join(root, 'ios/App/App.xcodeproj'))) cap(['add', 'ios', '--packagemanager', 'SPM']);
cap(['sync', 'ios']);
const bundled = JSON.parse(readFileSync(path.join(root, 'ios/App/App/capacitor.config.json'), 'utf8'));
if (bundled.server?.url || !/^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z][a-zA-Z0-9-]*){2,}$/.test(bundled.appId || '')) {
  throw new Error('Refusing a remote server URL or invalid app identity.');
}
for (const file of ['index.html', 'watch.html', 'native-build.json']) {
  if (!existsSync(path.join(root, 'ios/App/App/public', file))) throw new Error(`Missing bundled resource: ${file}`);
}
for (const file of ['sw.js', 'sw-standalone.js', 'install.html', 'LibreTV.mobileconfig', 'api']) {
  if (existsSync(path.join(root, 'ios/App/App/public', file))) throw new Error(`Unexpected website/server resource: ${file}`);
}
console.log('Local iOS project ready. No remote website is configured. Open it in Xcode on macOS to compile, sign and install; this is not an IPA.');
