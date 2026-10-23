import { pbkdf2Sync, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./runtime-mode', () => ({ IS_NATIVE: true, IS_STANDALONE: true }));

import {
  DEVICE_LOCK_ITERATIONS, DEVICE_LOCK_STORAGE_KEY,
  changeDevicePin, setupDevicePin, verifyDevicePin,
} from './device-lock';

// These values belong only to the automated fixture, never to an installed app.
const TEST_PIN = '057294';
const NEW_PIN = '483106';
let values: Map<string, string>;
const randomOnlyCrypto = () => ({ getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });

beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
  vi.stubGlobal('crypto', randomOnlyCrypto());
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('native PIN without SubtleCrypto', () => {
  it('derives the same full-strength verifier as Node PBKDF2 for a known salt', async () => {
    const salt = Uint8Array.from({ length: 16 }, (_, index) => index * 17);
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => { bytes.set(salt); return bytes; } });
    await setupDevicePin(TEST_PIN);
    const record = JSON.parse(values.get(DEVICE_LOCK_STORAGE_KEY)!);
    expect(record.salt).toBe('00112233445566778899aabbccddeeff');
    expect(record.iterations).toBe(210_000);
    expect(record.digest).toBe(pbkdf2Sync(TEST_PIN, salt, DEVICE_LOCK_ITERATIONS, 32, 'sha256').toString('hex'));
    expect(Object.keys(record).sort()).toEqual(['digest', 'iterations', 'salt', 'version']);
    expect(Object.values(record)).not.toContain(TEST_PIN);
    expect(await verifyDevicePin(NEW_PIN)).toMatchObject({ ok: false, failures: 1 });
    expect(await verifyDevicePin(TEST_PIN)).toEqual({ ok: true, failures: 0, retryAt: 0 });
  }, 15_000);

  it('generates independent cryptographically random salts when SubtleCrypto is absent', async () => {
    await setupDevicePin(TEST_PIN);
    const first = JSON.parse(values.get(DEVICE_LOCK_STORAGE_KEY)!);
    values.clear();
    await setupDevicePin(TEST_PIN);
    const second = JSON.parse(values.get(DEVICE_LOCK_STORAGE_KEY)!);
    expect(second.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(first.salt).not.toBe(second.salt);
    expect(first.digest).not.toBe(second.digest);
  }, 15_000);

  it('verifies an existing WebCrypto record and can change it without format migration', async () => {
    vi.stubGlobal('crypto', webcrypto);
    await setupDevicePin(TEST_PIN);
    const original = values.get(DEVICE_LOCK_STORAGE_KEY);
    vi.stubGlobal('crypto', randomOnlyCrypto());
    expect(await changeDevicePin(NEW_PIN, NEW_PIN)).toMatchObject({ ok: false });
    expect(values.get(DEVICE_LOCK_STORAGE_KEY)).toBe(original);
    expect(await changeDevicePin(TEST_PIN, NEW_PIN)).toMatchObject({ ok: true });
    expect(await verifyDevicePin(TEST_PIN)).toMatchObject({ ok: false });
    expect(await verifyDevicePin(NEW_PIN)).toMatchObject({ ok: true });
    // A record made by the JS KDF also remains compatible with WebCrypto.
    vi.stubGlobal('crypto', webcrypto);
    expect(await verifyDevicePin(NEW_PIN)).toMatchObject({ ok: true });
  }, 15_000);

  it.each([undefined, {}, { subtle: webcrypto.subtle }])('refuses setup without a secure random source: %j', async (crypto) => {
    vi.stubGlobal('crypto', crypto);
    await expect(setupDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'crypto' });
    expect(values.has(DEVICE_LOCK_STORAGE_KEY)).toBe(false);
  });

  it('prefers available WebCrypto and fails rather than hiding a WebCrypto error', async () => {
    const deriveBits = vi.fn().mockRejectedValue(new Error('device crypto unavailable'));
    vi.stubGlobal('crypto', {
      ...randomOnlyCrypto(),
      subtle: { importKey: webcrypto.subtle.importKey.bind(webcrypto.subtle), deriveBits },
    });
    await expect(setupDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'crypto' });
    expect(deriveBits).toHaveBeenCalledOnce();
    expect(values.has(DEVICE_LOCK_STORAGE_KEY)).toBe(false);
  });
});
