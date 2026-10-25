/** Optional, removable iOS WebClip. This is not an IPA or MDM enrollment. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = new URL(process.env.APP_INSTALL_URL || 'https://libretv-pocket-15pm-c3d9.honestfairy18.chatgpt.site/');
if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash || site.pathname !== '/') {
  throw new Error('APP_INSTALL_URL must be a plain HTTPS site origin without credentials.');
}
const escapeXml = (value) => value.replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]));
const uuid = (scope) => {
  const hex = createHash('sha256').update(site.origin + ':' + scope).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`.toUpperCase();
};
const icon = readFileSync(path.join(root, 'public/icons/vip-apple-touch-icon.png')).toString('base64');
const profile = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>org.libretv.personal.webclip</string>
  <key>PayloadUUID</key><string>${uuid('profile')}</string>
  <key>PayloadDisplayName</key><string>VIP影视 主屏幕快捷方式</string>
  <key>PayloadDescription</key><string>仅添加可移除的全屏网页图标。不配置设备管理、证书或网络。此描述文件未签名；也可用 Safari 分享菜单添加到主屏幕。</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadContent</key><array><dict>
    <key>PayloadType</key><string>com.apple.webClip.managed</string>
    <key>PayloadVersion</key><integer>1</integer>
    <key>PayloadIdentifier</key><string>org.libretv.personal.webclip.home</string>
    <key>PayloadUUID</key><string>${uuid('webclip')}</string>
    <key>PayloadDisplayName</key><string>VIP影视</string>
    <key>Label</key><string>VIP影视</string>
    <key>URL</key><string>${escapeXml(site.href)}</string>
    <key>FullScreen</key><true/>
    <key>IsRemovable</key><true/>
    <key>Precomposed</key><true/>
    <key>IgnoreManifestScope</key><false/>
    <key>Icon</key><data>${icon}</data>
  </dict></array>
</dict></plist>
`;
writeFileSync(path.join(root, 'public/LibreTV.mobileconfig'), profile);
console.log('Prepared removable VIP影视 iPhone home-screen shortcut.');
