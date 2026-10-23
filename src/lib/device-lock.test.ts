import { pbkdf2Sync, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVICE_LOCK_ATTEMPTS_KEY, DEVICE_LOCK_ITERATIONS, DEVICE_LOCK_STORAGE_KEY,
  changeDevicePin, isValidDevicePin, readDeviceLockState, setupDevicePin, verifyDevicePin,
} from './device-lock';

// Test-only PINs are never bundled as an application's default credential.
const TEST_PIN = '042731';
const WRONG_PIN = '998877';
let values: Map<string, string>;
let storage: Storage;

beforeEach(() => {
  vi.restoreAllMocks();
  values = new Map();
  storage = {
    get length() { return values.size; },
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    clear: vi.fn(() => { values.clear(); }),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('crypto', webcrypto);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('device-only PIN', () => {
  it('starts unconfigured, creates a salted PBKDF2 record and never stores the plaintext PIN', async () => {
    expect(readDeviceLockState()).toEqual({ configured: false, failures: 0, retryAt: 0 });
    await setupDevicePin(TEST_PIN);
    const raw = values.get(DEVICE_LOCK_STORAGE_KEY)!;
    const record = JSON.parse(raw);
    expect(Object.keys(record).sort()).toEqual(['digest', 'iterations', 'salt', 'version']);
    expect(record.iterations).toBe(DEVICE_LOCK_ITERATIONS);
    expect(record.salt).toMatch(/^[a-f0-9]{32}$/);
    expect(record.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(record.digest).toBe(pbkdf2Sync(TEST_PIN, Buffer.from(record.salt, 'hex'), record.iterations, 32, 'sha256').toString('hex'));
    expect(Object.values(record)).not.toContain(TEST_PIN);
    expect(readDeviceLockState().configured).toBe(true);
    expect(await verifyDevicePin(TEST_PIN)).toEqual({ ok: true, failures: 0, retryAt: 0 });
    expect(await verifyDevicePin(WRONG_PIN)).toEqual({ ok: false, failures: 1, retryAt: 0 });
  });

  it('the same PIN on two devices has independent salt and verifier', async () => {
    await setupDevicePin(TEST_PIN);
    const first = JSON.parse(values.get(DEVICE_LOCK_STORAGE_KEY)!);
    values.clear();
    await setupDevicePin(TEST_PIN);
    const second = JSON.parse(values.get(DEVICE_LOCK_STORAGE_KEY)!);
    expect(second.salt).not.toBe(first.salt);
    expect(second.digest).not.toBe(first.digest);
    expect(await verifyDevicePin(TEST_PIN)).toMatchObject({ ok: true });
  });

  it.each(['', '12345', '1234567', '１２３４５６', 'abcdef', '123 45', '12345\n', '123456\n'])('refuses invalid ASCII digit input: %j', async (pin) => {
    expect(isValidDevicePin(pin)).toBe(false);
    await expect(setupDevicePin(pin)).rejects.toMatchObject({ code: 'invalid-pin' });
    expect(values.size).toBe(0);
  });

  it('does not overwrite an existing PIN through the setup path', async () => {
    await setupDevicePin(TEST_PIN);
    const raw = values.get(DEVICE_LOCK_STORAGE_KEY);
    await expect(setupDevicePin(WRONG_PIN)).rejects.toMatchObject({ code: 'already-configured' });
    expect(values.get(DEVICE_LOCK_STORAGE_KEY)).toBe(raw);
    expect(await verifyDevicePin(TEST_PIN)).toMatchObject({ ok: true });
  });

  it('changes the PIN only after the old PIN is verified and invalidates the old credential', async () => {
    await setupDevicePin(TEST_PIN);
    const raw = values.get(DEVICE_LOCK_STORAGE_KEY);
    expect(await changeDevicePin(WRONG_PIN, '308192')).toMatchObject({ ok: false, failures: 1 });
    expect(values.get(DEVICE_LOCK_STORAGE_KEY)).toBe(raw);
    expect(await changeDevicePin(TEST_PIN, '308192')).toEqual({ ok: true, failures: 0, retryAt: 0 });
    expect(await verifyDevicePin(TEST_PIN)).toMatchObject({ ok: false });
    expect(await verifyDevicePin('308192')).toMatchObject({ ok: true });
  });

  it('serializes simultaneous wrong submissions, persists cooldown, then allows a fresh attempt after expiry', async () => {
    await setupDevicePin(TEST_PIN);
    const now = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const attempts = await Promise.all(Array.from({ length: 5 }, () => verifyDevicePin(WRONG_PIN)));
    expect(attempts.map((result) => result.failures)).toEqual([1, 2, 3, 4, 5]);
    expect(readDeviceLockState()).toEqual({ configured: true, failures: 5, retryAt: now + 30_000 });
    expect(await verifyDevicePin(TEST_PIN)).toEqual({ ok: false, failures: 5, retryAt: now + 30_000 });
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_000);
    expect(readDeviceLockState()).toEqual({ configured: true, failures: 0, retryAt: 0 });
    expect(await verifyDevicePin(TEST_PIN)).toEqual({ ok: true, failures: 0, retryAt: 0 });
    expect(values.has(DEVICE_LOCK_ATTEMPTS_KEY)).toBe(false);
  });

  it('success clears prior failures so the next failed attempt starts at one', async () => {
    await setupDevicePin(TEST_PIN);
    await verifyDevicePin(WRONG_PIN);
    await verifyDevicePin(TEST_PIN);
    expect(await verifyDevicePin(WRONG_PIN)).toEqual({ ok: false, failures: 1, retryAt: 0 });
  });

  it.each([
    'broken-json', '{}', 'null',
    JSON.stringify({ version: 1, salt: 'a'.repeat(32), digest: 'b'.repeat(64), iterations: 2_147_483_647 }),
    JSON.stringify({ version: 1, salt: 'a'.repeat(32), digest: 'b'.repeat(64), iterations: DEVICE_LOCK_ITERATIONS, pin: TEST_PIN }),
    JSON.stringify({ version: 1, salt: 'a'.repeat(32) + '\n', digest: 'b'.repeat(64), iterations: DEVICE_LOCK_ITERATIONS }),
  ])('corrupt PIN records fail closed, including iteration abuse or plaintext legacy fields', async (raw) => {
    values.set(DEVICE_LOCK_STORAGE_KEY, raw);
    expect(() => readDeviceLockState()).toThrow(/密码记录异常/);
    await expect(verifyDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'corrupt' });
    await expect(setupDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'corrupt' });
    expect(values.get(DEVICE_LOCK_STORAGE_KEY)).toBe(raw);
  });

  it('corrupt or orphan retry state does not silently unlock or reset configuration', async () => {
    values.set(DEVICE_LOCK_ATTEMPTS_KEY, '{"failures":0}');
    expect(() => readDeviceLockState()).toThrow(/密码记录异常/);
    values.delete(DEVICE_LOCK_ATTEMPTS_KEY);
    await setupDevicePin(TEST_PIN);
    values.set(DEVICE_LOCK_ATTEMPTS_KEY, '{"version":1,"failures":-1,"retryAt":0}');
    await expect(verifyDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'corrupt' });
  });

  it('storage read errors never become an unconfigured or unlocked result', async () => {
    vi.mocked(storage.getItem).mockImplementation(() => { throw new Error('blocked'); });
    expect(() => readDeviceLockState()).toThrow(/读取本机密码/);
    await expect(setupDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'storage' });
  });

  it('setup write failure does not create a credential or remove user records', async () => {
    values.set('libretv-settings', 'private-existing-settings');
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('quota'); });
    await expect(setupDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'storage' });
    expect(values.get('libretv-settings')).toBe('private-existing-settings');
    expect(values.has(DEVICE_LOCK_STORAGE_KEY)).toBe(false);
  });

  it('failed change persistence keeps the old PIN valid', async () => {
    await setupDevicePin(TEST_PIN);
    vi.mocked(storage.setItem).mockImplementation(() => { throw new Error('quota'); });
    await expect(changeDevicePin(TEST_PIN, WRONG_PIN)).rejects.toMatchObject({ code: 'storage' });
    vi.mocked(storage.setItem).mockImplementation((key, value) => { values.set(key, value); });
    expect(await verifyDevicePin(TEST_PIN)).toMatchObject({ ok: true });
  });

  it('failure to clear retry state refuses an otherwise correct PIN', async () => {
    await setupDevicePin(TEST_PIN);
    await verifyDevicePin(WRONG_PIN);
    vi.mocked(storage.removeItem).mockImplementation(() => { throw new Error('blocked'); });
    await expect(verifyDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'storage' });
    expect(values.has(DEVICE_LOCK_ATTEMPTS_KEY)).toBe(true);
  });

  it('does not accept an old PIN result when another page replaces the credential during hashing', async () => {
    await setupDevicePin(TEST_PIN);
    let reads = 0;
    vi.mocked(storage.getItem).mockImplementation((key) => {
      if (key === DEVICE_LOCK_STORAGE_KEY && ++reads === 2) return null;
      return values.get(key) ?? null;
    });
    await expect(verifyDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'changed' });
  });

  it('does not fall back to weak hashing when WebCrypto is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    await expect(setupDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'crypto' });
    expect(values.has(DEVICE_LOCK_STORAGE_KEY)).toBe(false);
  });

  it('rejects verification before initial setup', async () => {
    await expect(verifyDevicePin(TEST_PIN)).rejects.toMatchObject({ code: 'not-configured' });
  });
});
