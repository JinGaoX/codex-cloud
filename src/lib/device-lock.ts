/**
 * A device-only privacy lock for the standalone app, not server authentication or
 * encrypted storage. Never persist a plaintext PIN or send it over the network.
 */
import { IS_NATIVE } from './runtime-mode';

export const DEVICE_LOCK_STORAGE_KEY = 'libretv-device-lock-v1';
export const DEVICE_LOCK_ATTEMPTS_KEY = 'libretv-device-lock-attempts-v1';
export const DEVICE_LOCK_ITERATIONS = 210_000;
const RETRY_DELAY_MS = 30_000;
const MAX_FAILURES = 5;

type DeviceLockErrorCode = 'storage' | 'corrupt' | 'invalid-pin' | 'crypto' |
  'already-configured' | 'not-configured' | 'changed';

export class DeviceLockError extends Error {
  constructor(public readonly code: DeviceLockErrorCode, message: string) {
    super(message);
    this.name = 'DeviceLockError';
  }
}

interface PinRecord {
  version: 1;
  salt: string;
  digest: string;
  iterations: number;
}

interface AttemptRecord {
  version: 1;
  failures: number;
  retryAt: number;
}

export interface DeviceLockState {
  configured: boolean;
  /** Timestamp in milliseconds; 0 means a new attempt is allowed. */
  retryAt: number;
  failures: number;
}

export interface DevicePinResult {
  ok: boolean;
  retryAt: number;
  failures: number;
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function corrupt(): never {
  throw new DeviceLockError('corrupt', '本机密码记录异常，无法解锁。请检查浏览器存储；清除网站数据会同时清除本机记录。');
}

function storage(): Storage {
  try {
    const value = globalThis.localStorage;
    if (!value) throw new Error('Unavailable');
    return value;
  } catch {
    throw new DeviceLockError('storage', '无法访问本机存储，请允许 Safari 保存网站数据后重试。');
  }
}

function read(key: string): string | null {
  try { return storage().getItem(key); }
  catch (error) {
    if (error instanceof DeviceLockError) throw error;
    throw new DeviceLockError('storage', '无法读取本机密码，请检查浏览器存储后重试。');
  }
}

function write(key: string, value: string): void {
  try { storage().setItem(key, value); }
  catch {
    throw new DeviceLockError('storage', '本机密码未保存成功，请检查存储空间后重试。');
  }
}

function clearAttempts(): void {
  try { storage().removeItem(DEVICE_LOCK_ATTEMPTS_KEY); }
  catch {
    throw new DeviceLockError('storage', '无法保存本次解锁结果，请检查本机存储后重试。');
  }
}

function pinRecord(raw: string): PinRecord {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return corrupt(); }
  if (!object(value) || value.version !== 1 ||
    typeof value.salt !== 'string' || value.salt.length !== 32 || !/^[0-9a-f]{32}$/.test(value.salt) ||
    typeof value.digest !== 'string' || value.digest.length !== 64 || !/^[0-9a-f]{64}$/.test(value.digest) ||
    typeof value.iterations !== 'number' || !Number.isInteger(value.iterations) ||
    value.iterations < 100_000 || value.iterations > 1_000_000 ||
    Object.keys(value).some((key) => !['version', 'salt', 'digest', 'iterations'].includes(key))) return corrupt();
  return value as unknown as PinRecord;
}

function attemptRecord(raw: string | null, now = Date.now()): AttemptRecord {
  if (raw === null) return { version: 1, failures: 0, retryAt: 0 };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return corrupt(); }
  if (!object(value) || value.version !== 1 ||
    typeof value.failures !== 'number' || !Number.isInteger(value.failures) || value.failures < 1 || value.failures > MAX_FAILURES ||
    typeof value.retryAt !== 'number' || !Number.isSafeInteger(value.retryAt) || value.retryAt < 0 ||
    (value.failures < MAX_FAILURES && value.retryAt !== 0) ||
    (value.failures === MAX_FAILURES && value.retryAt === 0) ||
    Object.keys(value).some((key) => !['version', 'failures', 'retryAt'].includes(key))) return corrupt();
  if (value.retryAt > 0 && value.retryAt <= now) return { version: 1, failures: 0, retryAt: 0 };
  return value as unknown as AttemptRecord;
}

function current() {
  const raw = read(DEVICE_LOCK_STORAGE_KEY);
  const attemptsRaw = read(DEVICE_LOCK_ATTEMPTS_KEY);
  if (raw === null) {
    if (attemptsRaw !== null) return corrupt();
    return { raw, pin: null, attempts: attemptRecord(null) };
  }
  return { raw, pin: pinRecord(raw), attempts: attemptRecord(attemptsRaw) };
}

/** An unreadable or malformed record throws; it never becomes an unlocked state. */
export function readDeviceLockState(): DeviceLockState {
  const { pin, attempts } = current();
  return { configured: pin !== null, failures: attempts.failures, retryAt: attempts.retryAt };
}

export function isValidDevicePin(pin: string): boolean { return pin.length === 6 && /^[0-9]{6}$/.test(pin); }

function validatePin(pin: string): void {
  if (!isValidDevicePin(pin)) throw new DeviceLockError('invalid-pin', '请输入 6 位数字密码。');
}

function webCrypto(): Crypto {
  // WKWebView's local capacitor:// origin may expose secure random bytes without
  // SubtleCrypto. Only a bundled native build may use the equivalent JS KDF.
  if (typeof globalThis.crypto?.getRandomValues !== 'function' || (!IS_NATIVE && !globalThis.crypto.subtle)) {
    throw new DeviceLockError('crypto', IS_NATIVE
      ? '当前设备无法安全保存本机密码，请重新打开应用后重试。'
      : '当前浏览器无法安全保存本机密码，请使用 Safari 打开 HTTPS 地址。');
  }
  return globalThis.crypto;
}

const hex = (value: Uint8Array): string => [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
function unhex(value: string): ArrayBuffer {
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes.buffer;
}

async function digest(pin: string, salt: string, iterations: number): Promise<string> {
  try {
    const crypto = webCrypto();
    if (IS_NATIVE && !crypto.subtle) {
      const [{ pbkdf2Async }, { sha256 }] = await Promise.all([
        import('@noble/hashes/pbkdf2.js'), import('@noble/hashes/sha2.js'),
      ]);
      const bits = await pbkdf2Async(sha256, new TextEncoder().encode(pin), new Uint8Array(unhex(salt)), {
        c: iterations, dkLen: 32, asyncTick: 8,
      });
      return hex(bits);
    }
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations }, key, 256);
    return hex(new Uint8Array(bits));
  } catch (error) {
    if (error instanceof DeviceLockError) throw error;
    throw new DeviceLockError('crypto', '本机密码计算失败，请重新打开应用后重试。');
  }
}

async function createRecord(pin: string): Promise<PinRecord> {
  const salt = hex(webCrypto().getRandomValues(new Uint8Array(16)));
  return { version: 1, salt, iterations: DEVICE_LOCK_ITERATIONS, digest: await digest(pin, salt, DEVICE_LOCK_ITERATIONS) };
}

function sameDigest(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ (b.charCodeAt(index) || 0);
  return difference === 0;
}

function unchanged(raw: string | null): void {
  if (read(DEVICE_LOCK_STORAGE_KEY) !== raw) {
    throw new DeviceLockError('changed', '本机密码已在其他页面更改，请重新打开应用后验证。');
  }
}

// Serialize local submissions so a double click cannot lose retry counts or overwrite a PIN change.
let pending: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation, operation);
  pending = next.then(() => undefined, () => undefined);
  return next;
}

export function setupDevicePin(pin: string): Promise<void> {
  return serial(async () => {
    validatePin(pin);
    const before = current();
    if (before.pin) throw new DeviceLockError('already-configured', '本机密码已设置，请输入原密码解锁。');
    const record = await createRecord(pin);
    unchanged(before.raw);
    write(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(record));
  });
}

async function verifyInternal(pin: string): Promise<{ result: DevicePinResult; raw: string }> {
  validatePin(pin);
  const before = current();
  if (!before.pin || !before.raw) throw new DeviceLockError('not-configured', '请先设置本机数字密码。');
  if (before.attempts.retryAt > Date.now()) {
    return { result: { ok: false, failures: before.attempts.failures, retryAt: before.attempts.retryAt }, raw: before.raw };
  }
  const candidate = await digest(pin, before.pin.salt, before.pin.iterations);
  unchanged(before.raw);
  if (sameDigest(candidate, before.pin.digest)) {
    clearAttempts();
    return { result: { ok: true, failures: 0, retryAt: 0 }, raw: before.raw };
  }
  // Reread the retry record after hashing to avoid discarding another tab's completed failure.
  const attempts = attemptRecord(read(DEVICE_LOCK_ATTEMPTS_KEY));
  if (attempts.retryAt > Date.now()) {
    return { result: { ok: false, failures: attempts.failures, retryAt: attempts.retryAt }, raw: before.raw };
  }
  const failures = attempts.failures + 1;
  const retryAt = failures >= MAX_FAILURES ? Date.now() + RETRY_DELAY_MS : 0;
  write(DEVICE_LOCK_ATTEMPTS_KEY, JSON.stringify({ version: 1, failures, retryAt }));
  return { result: { ok: false, failures, retryAt }, raw: before.raw };
}

export function verifyDevicePin(pin: string): Promise<DevicePinResult> {
  return serial(async () => (await verifyInternal(pin)).result);
}

/** The old PIN must verify before the replacement is generated and persisted. */
export function changeDevicePin(currentPin: string, newPin: string): Promise<DevicePinResult> {
  return serial(async () => {
    validatePin(newPin);
    const verified = await verifyInternal(currentPin);
    if (!verified.result.ok) return verified.result;
    const record = await createRecord(newPin);
    unchanged(verified.raw);
    write(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(record));
    return { ok: true, failures: 0, retryAt: 0 };
  });
}
