import { IS_NATIVE } from './runtime-mode';
import { appPath } from './app-path';

export type LocalFileExportResult = 'download-started' | 'share-finished' | 'cancelled';

/** A completed share action does not prove the user saved a file. */
export function localFileExportMessage(result: LocalFileExportResult): string {
  if (result === 'cancelled') return '已取消导出';
  return result === 'share-finished'
    ? '分享面板已关闭，请确认文件已保存'
    : '已开始下载，请确认文件已保存';
}

function validateFilename(filename: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(filename) || filename.includes('..')) {
    throw new Error('导出文件名无效');
  }
}

async function requireNativePlatform(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (!IS_NATIVE || !Capacitor.isNativePlatform()) {
    throw new Error('请在已安装的 App 中导出文件');
  }
}

async function shareLocalFile(data: string, filename: string, text: boolean): Promise<LocalFileExportResult> {
  await requireNativePlatform();
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'), import('@capacitor/share'),
  ]);
  // Cache is app-private and not an automatic cloud backup. Keep the file after
  // the sheet closes: a receiving app may finish reading it asynchronously.
  const file = await Filesystem.writeFile({
    path: `exports/${filename}`,
    directory: Directory.Cache,
    data,
    recursive: true,
    ...(text ? { encoding: Encoding.UTF8 } : {}),
  });
  if (!file.uri.startsWith('file://')) throw new Error('无法创建本机导出文件');
  try {
    await Share.share({ title: filename, files: [file.uri], dialogTitle: '保存或分享文件' });
    return 'share-finished';
  } catch (error) {
    // Capacitor iOS reports this exact message when the user dismisses the sheet.
    if (error instanceof Error && (error.message === 'Share canceled' || error.name === 'AbortError')) {
      return 'cancelled';
    }
    throw error;
  }
}

/** User-initiated local export only. No configuration is uploaded by this helper. */
export async function exportTextFile(data: string, filename: string): Promise<LocalFileExportResult> {
  validateFilename(filename);
  if (IS_NATIVE) return shareLocalFile(data, filename, true);

  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  let clicked = false;
  try {
    document.body.appendChild(anchor);
    anchor.click();
    clicked = true;
  } finally {
    anchor.remove();
    // Safari can read the Blob after click() returns.
    if (clicked) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    else URL.revokeObjectURL(url);
  }
  return 'download-started';
}

/** Share the public source archive bundled in the native app, without a host. */
export async function exportNativeSourceArchive(): Promise<LocalFileExportResult> {
  await requireNativePlatform();
  const response = await fetch(appPath('/source-code.tar.gz'), { cache: 'no-store', credentials: 'omit', redirect: 'error' });
  const maxBytes = 16 * 1024 * 1024;
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) {
    throw new Error('无法读取本机源码归档');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > maxBytes || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new Error('本机源码归档无效');
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return shareLocalFile(btoa(binary), 'LibreTV-source.tar.gz', false);
}
