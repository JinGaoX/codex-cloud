import { afterEach, describe, expect, it, vi } from 'vitest';
import nativeConfig from '../../capacitor.config';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('local application build boundaries', () => {
  it.each([
    ['native', true, true],
    ['standalone', false, true],
    ['', false, false],
  ])('selects %s capabilities without enabling server APIs in local builds', async (mode, native, standalone) => {
    vi.stubEnv('NEXT_PUBLIC_APP_MODE', mode);
    vi.resetModules();
    const flags = await import('./runtime-mode');
    expect(flags.IS_NATIVE).toBe(native);
    expect(flags.IS_STANDALONE).toBe(standalone);
  });

  it('ships application files with a stable local identity and no remote server or navigation allowlist', () => {
    expect(nativeConfig.webDir).toBe('native-dist');
    expect(nativeConfig.appId).toBe('org.libretv.personal');
    expect(nativeConfig.server?.hostname).toBe('localhost');
    expect(nativeConfig.server?.iosScheme).toBe('capacitor');
    expect(nativeConfig.server?.url).toBeUndefined();
    expect(nativeConfig.server?.allowNavigation).toBeUndefined();
    expect(nativeConfig.server?.cleartext).not.toBe(true);
    expect(nativeConfig.plugins?.CapacitorHttp?.enabled).toBe(false);
  });
});
