import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  writeFile: vi.fn(),
  share: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: native.isNativePlatform } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: { writeFile: native.writeFile },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: native.share } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'native');
  native.isNativePlatform.mockReturnValue(true);
  native.writeFile.mockResolvedValue({ uri: 'file:///private/app/Library/Caches/exports/backup.json' });
  native.share.mockResolvedValue({ activityType: 'com.apple.CloudDocsUI.AddToiCloudDrive' });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('local native file export', () => {
  it('writes the exact UTF-8 configuration to private cache and opens a local-file share without uploading it', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { exportTextFile, localFileExportMessage } = await import('./local-file-export');
    const data = JSON.stringify({ label: '我的私人配置', source: 'https://example.invalid/?token=private-fixture' });
    const result = await exportTextFile(data, 'LibreTV-Settings_1.json');
    expect(native.writeFile).toHaveBeenCalledWith({
      path: 'exports/LibreTV-Settings_1.json', directory: 'CACHE', data, encoding: 'utf8', recursive: true,
    });
    expect(native.share).toHaveBeenCalledWith({
      title: 'LibreTV-Settings_1.json',
      files: ['file:///private/app/Library/Caches/exports/backup.json'], dialogTitle: '保存或分享文件',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toBe('share-finished');
    expect(localFileExportMessage(result)).toContain('请确认');
  });

  it('does not pretend the native export works when there is no installed native bridge', async () => {
    native.isNativePlatform.mockReturnValue(false);
    const { exportTextFile } = await import('./local-file-export');
    await expect(exportTextFile('{}', 'backup.json')).rejects.toThrow('已安装的 App');
    expect(native.writeFile).not.toHaveBeenCalled();
    expect(native.share).not.toHaveBeenCalled();
  });

  it('propagates write failure and never opens a share sheet for a nonexistent file', async () => {
    native.writeFile.mockRejectedValue(new Error('Disk full'));
    const { exportTextFile } = await import('./local-file-export');
    await expect(exportTextFile('{}', 'backup.json')).rejects.toThrow('Disk full');
    expect(native.share).not.toHaveBeenCalled();
  });

  it('rejects a nonlocal file URI rather than sending it to another app', async () => {
    native.writeFile.mockResolvedValue({ uri: 'https://example.invalid/upload' });
    const { exportTextFile } = await import('./local-file-export');
    await expect(exportTextFile('{}', 'backup.json')).rejects.toThrow('本机导出文件');
    expect(native.share).not.toHaveBeenCalled();
  });

  it('treats the iOS share cancellation as cancellation, without a saved-file claim', async () => {
    native.share.mockRejectedValue(new Error('Share canceled'));
    const { exportTextFile, localFileExportMessage } = await import('./local-file-export');
    const result = await exportTextFile('{}', 'backup.json');
    expect(result).toBe('cancelled');
    expect(localFileExportMessage(result)).toBe('已取消导出');
  });

  it('keeps genuine share errors visible instead of treating all rejections as cancellation', async () => {
    native.share.mockRejectedValue(new Error('Error sharing item'));
    const { exportTextFile } = await import('./local-file-export');
    await expect(exportTextFile('{}', 'backup.json')).rejects.toThrow('Error sharing item');
  });

  it.each(['../backup.json', 'folder/backup.json', 'folder\\backup.json', 'https://example.invalid/a.json', '', '.hidden'])
    ('rejects an unsafe filename before any file operation: %s', async (filename) => {
      const { exportTextFile } = await import('./local-file-export');
      await expect(exportTextFile('{}', filename)).rejects.toThrow('文件名');
      expect(native.writeFile).not.toHaveBeenCalled();
      expect(native.share).not.toHaveBeenCalled();
    });
});

describe('bundled source archive export', () => {
  it('reads only the fixed local archive and writes binary gzip as base64 without UTF-8 encoding', async () => {
    const archive = Uint8Array.from([0x1f, 0x8b, 0x08, 0x00, 0xff, 0x01]);
    const fetch = vi.fn().mockResolvedValue(new Response(archive));
    vi.stubGlobal('fetch', fetch);
    const { exportNativeSourceArchive } = await import('./local-file-export');
    expect(await exportNativeSourceArchive()).toBe('share-finished');
    expect(fetch).toHaveBeenCalledWith('/source-code.tar.gz', { cache: 'no-store', credentials: 'omit', redirect: 'error' });
    const options = native.writeFile.mock.calls[0][0];
    expect(options.path).toBe('exports/LibreTV-source.tar.gz');
    expect(options.encoding).toBeUndefined();
    expect(Buffer.from(options.data, 'base64')).toEqual(Buffer.from(archive));
  });

  it('does not fetch the archive before confirming an actual native app is present', async () => {
    native.isNativePlatform.mockReturnValue(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { exportNativeSourceArchive } = await import('./local-file-export');
    await expect(exportNativeSourceArchive()).rejects.toThrow('已安装的 App');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([new Response('Not found', { status: 404 }), new Response('<html>Login</html>')])
    ('does not export a missing archive or HTML page as source code', async (response) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      const { exportNativeSourceArchive } = await import('./local-file-export');
      await expect(exportNativeSourceArchive()).rejects.toThrow(/源码归档/);
      expect(native.writeFile).not.toHaveBeenCalled();
      expect(native.share).not.toHaveBeenCalled();
    });

  it('rejects a declared oversized archive without consuming the body', async () => {
    const response = new Response(Uint8Array.from([0x1f, 0x8b]), { headers: { 'content-length': String(17 * 1024 * 1024) } });
    const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const { exportNativeSourceArchive } = await import('./local-file-export');
    await expect(exportNativeSourceArchive()).rejects.toThrow('源码归档');
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(native.writeFile).not.toHaveBeenCalled();
  });
});

describe('browser file export', () => {
  function mockDownload() {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', 'standalone');
    const anchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fixture');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    return { anchor, create, revoke };
  }

  it('preserves the JSON download and waits for Safari to read the Blob before revocation', async () => {
    vi.useFakeTimers();
    const { anchor, create, revoke } = mockDownload();
    const { exportTextFile } = await import('./local-file-export');
    expect(await exportTextFile('{"label":"本机"}', 'backup.json')).toBe('download-started');
    expect(anchor.download).toBe('backup.json');
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(await (create.mock.calls[0][0] as Blob).text()).toBe('{"label":"本机"}');
    expect(native.isNativePlatform).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59_999);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledWith('blob:fixture');
  });

  it('surfaces a browser download failure and cleans its unused Blob immediately', async () => {
    const { anchor, revoke } = mockDownload();
    anchor.click.mockImplementation(() => { throw new Error('Download blocked'); });
    const { exportTextFile } = await import('./local-file-export');
    await expect(exportTextFile('{}', 'backup.json')).rejects.toThrow('Download blocked');
    expect(anchor.remove).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith('blob:fixture');
    expect(native.writeFile).not.toHaveBeenCalled();
  });
});
