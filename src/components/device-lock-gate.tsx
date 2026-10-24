'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { APP_BRAND } from '@/lib/app-brand';
import { IS_NATIVE, IS_STANDALONE } from '@/lib/runtime-mode';
import { changeDevicePin, readDeviceLockState, setupDevicePin, verifyDevicePin } from '@/lib/device-lock';
import { InstallAppButton } from './pwa-runtime';
import { Spinner } from './states';

type LockPhase = 'checking' | 'setup' | 'locked' | 'unlocked' | 'error';
const DeviceLockContext = createContext<{ lock: () => void } | null>(null);

/** Never persist an unlocked session: a new page load must verify the local PIN. */
export function DeviceLockGate({ children }: { children: ReactNode }) {
  return IS_STANDALONE ? <StandaloneDeviceLock>{children}</StandaloneDeviceLock> : children;
}

function StandaloneDeviceLock({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<LockPhase>('checking');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState(0);
  const [standalone, setStandalone] = useState(true);
  const pending = useRef(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const remaining = useRetryCountdown(retryAt);

  const readState = useCallback(() => {
    setPin('');
    setConfirmPin('');
    setError('');
    try {
      const state = readDeviceLockState();
      setRetryAt(state.retryAt);
      setPhase(state.configured ? 'locked' : 'setup');
    } catch (cause) {
      setError(errorMessage(cause));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (!IS_NATIVE) {
      setStandalone(window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true);
    }
    readState();
  }, [readState]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || remaining > 0) return;
    setError('');
    if (!/^\d{6}$/.test(pin)) {
      setError('请输入6位数字密码。');
      return;
    }
    if (phase === 'setup' && pin !== confirmPin) {
      setError('两次输入的密码不一致，请重新确认。');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      if (phase === 'setup') {
        await setupDevicePin(pin);
      } else {
        const result = await verifyDevicePin(pin);
        setRetryAt(result.retryAt);
        if (!result.ok) {
          setError('密码不正确，请重试。');
          setPin('');
          pinRef.current?.focus();
          return;
        }
      }
      setPin('');
      setConfirmPin('');
      setPhase('unlocked');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (phase === 'unlocked') {
    return <DeviceLockContext.Provider value={{ lock: readState }}>{children}</DeviceLockContext.Provider>;
  }

  return (
    <main
      className="min-h-[100svh] flex flex-col items-center justify-center px-5 py-8 bg-page"
      style={{ paddingTop: 'max(32px, env(safe-area-inset-top))', paddingBottom: 'max(32px, env(safe-area-inset-bottom))' }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-8">
          <img src={APP_BRAND.icons.large} alt="" className="w-14 h-14 rounded-2xl" />
          <div>
            <p className="text-xl font-semibold text-content">{APP_BRAND.name}</p>
            <p className="text-sm text-muted mt-1">你的私人观影空间</p>
          </div>
        </div>
        <section aria-labelledby="device-lock-title" className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2 text-accent">
            <LockIcon />
            <h1 id="device-lock-title" className="text-lg font-semibold text-content">
              {phase === 'setup' ? '设置本机密码' : phase === 'checking' ? '正在打开应用' : '输入本机密码'}
            </h1>
          </div>
          {phase === 'checking' ? (
            <div role="status" className="flex items-center gap-3 text-sm text-muted py-5"><Spinner size="sm" />正在检查本机设置…</div>
          ) : phase === 'error' ? (
            <div className="space-y-4 mt-4">
              <p role="alert" className="text-sm text-danger leading-6">{error}</p>
              <button className="btn-primary w-full" onClick={readState}>重新检查本机密码</button>
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-muted mb-5">
                {phase === 'setup' ? '无需注册账号。设置6位数字密码，下次打开时用它进入。' : '输入你在这台设备上设置的6位数字密码。'}
              </p>
              {phase === 'setup' && !IS_NATIVE && !standalone && (
                <div className="rounded-lg bg-accent/10 border border-accent/20 p-3 mb-5 text-sm leading-6">
                  <p className="text-content">建议先添加到主屏幕，再从图标打开并设置密码。</p>
                  <p className="text-muted mt-1">Safari 与主屏幕 App 的密码、收藏和历史可能独立保存。</p>
                  <a href="/install.html" className="inline-block text-accent underline underline-offset-4 mt-2">查看 iPhone 安装步骤</a>
                </div>
              )}
              <form onSubmit={submit} aria-label={phase === 'setup' ? '设置本机密码' : '解锁应用'} className="space-y-4">
                <PinField
                  label={phase === 'setup' ? '设置6位密码' : '6位本机密码'}
                  value={pin}
                  onChange={setPin}
                  inputRef={pinRef}
                  autoComplete={phase === 'setup' ? 'new-password' : 'current-password'}
                  disabled={busy || remaining > 0}
                />
                {phase === 'setup' && <PinField label="确认6位密码" value={confirmPin} onChange={setConfirmPin} autoComplete="new-password" disabled={busy} />}
                {error && <p role="alert" className="text-sm text-danger leading-6">{error}</p>}
                {remaining > 0 && <p role="status" className="text-sm text-muted">尝试次数较多，请在 {remaining} 秒后重试。</p>}
                <button type="submit" disabled={busy || remaining > 0} className="btn-primary w-full min-h-12 disabled:opacity-50 disabled:cursor-not-allowed">
                  {busy ? '正在验证…' : phase === 'setup' ? '设置密码并进入' : '解锁'}
                </button>
              </form>
            </>
          )}
          {phase !== 'checking' && <ForgotPinNote />}
        </section>
        {!IS_NATIVE && (
          <div className="flex items-center justify-between gap-4 mt-5">
            <a href="/install.html" className="text-sm text-accent underline underline-offset-4">添加到 iPhone 主屏幕</a>
            <InstallAppButton />
          </div>
        )}
        {IS_NATIVE && <p className="text-xs leading-6 text-muted mt-5">程序已安装在本机，无需登录在线账号。搜索和播放需要联网访问你配置的片源。</p>}
        <p className="text-xs leading-6 text-faint mt-4">本机密码只锁定当前设备的应用界面，不加密本机记录。请定期导出备份。</p>
      </div>
    </main>
  );
}

/** Shown under Settings → Data; keeping it here avoids crowding the mobile header. */
export function DeviceLockSettings() {
  const deviceLock = useContext(DeviceLockContext);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [retryAt, setRetryAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const remaining = useRetryCountdown(retryAt);

  useEffect(() => {
    try {
      setRetryAt(readDeviceLockState().retryAt);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  if (!deviceLock) return null;

  const changePin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || remaining > 0) return;
    setError('');
    setMessage('');
    if (!/^\d{6}$/.test(currentPin) || !/^\d{6}$/.test(nextPin)) {
      setError('当前密码和新密码都需要6位数字。');
      return;
    }
    if (nextPin !== confirmPin) {
      setError('两次输入的新密码不一致，请重新确认。');
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      const result = await changeDevicePin(currentPin, nextPin);
      setRetryAt(result.retryAt);
      setCurrentPin('');
      if (!result.ok) {
        setError('当前密码不正确，请重试。');
        return;
      }
      setNextPin('');
      setConfirmPin('');
      setMessage('本机密码已更改。下次打开时请使用新密码。');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-medium text-content flex items-center gap-2"><LockIcon />本机密码</h3>
        <p className="text-xs text-muted leading-6">密码只保存在当前设备，不需要注册。刷新或重新加载应用时需要解锁；切到后台不会自动锁定，以便恢复播放。</p>
        <button className="btn-ghost min-h-11 w-full" onClick={deviceLock.lock} disabled={busy}>立即锁定</button>
      </section>
      <section className="border-t border-line pt-5">
        <h3 className="text-sm font-medium text-content mb-4">更改本机密码</h3>
        <form onSubmit={changePin} aria-label="更改本机密码" className="space-y-4">
          <PinField label="当前本机密码" value={currentPin} onChange={setCurrentPin} autoComplete="current-password" disabled={busy || remaining > 0} />
          <PinField label="新的6位密码" value={nextPin} onChange={setNextPin} autoComplete="new-password" disabled={busy || remaining > 0} />
          <PinField label="再次确认新密码" value={confirmPin} onChange={setConfirmPin} autoComplete="new-password" disabled={busy || remaining > 0} />
          {error && <p role="alert" className="text-sm text-danger leading-6">{error}</p>}
          {message && <p role="status" className="text-sm text-success leading-6">{message}</p>}
          {remaining > 0 && <p role="status" className="text-sm text-muted">尝试次数较多，请在 {remaining} 秒后重试。</p>}
          <button type="submit" className="btn-primary w-full min-h-11 disabled:opacity-50 disabled:cursor-not-allowed" disabled={busy || remaining > 0}>
            {busy ? '正在更改…' : '更改密码'}
          </button>
        </form>
      </section>
      <p className="text-xs leading-6 text-faint">此密码不加密本机数据，也不会随配置导入或导出。</p>
      <ForgotPinNote />
    </div>
  );
}

function PinField({ label, value, onChange, disabled, autoComplete, inputRef }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoComplete: 'new-password' | 'current-password';
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <label className="block text-sm text-content">
      <span className="block mb-2">{label}</span>
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        autoComplete={autoComplete}
        pattern="[0-9]{6}"
        minLength={6}
        maxLength={6}
        required
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
        className="input w-full min-h-12 tracking-[0.4em] disabled:opacity-50"
      />
    </label>
  );
}

function ForgotPinNote() {
  return (
    <details className="mt-5 text-xs leading-6 text-muted">
      <summary className="cursor-pointer py-1">忘记密码？</summary>
      <p className="mt-2">{IS_NATIVE
        ? '密码无法找回。删除 App 及其本机数据后重新安装可重新设置，但会丢失本机配置、收藏和观看历史。已有导出备份可在重新进入后导入。'
        : '密码无法找回。如需重新设置，需要在系统或浏览器中清除此网站的本机数据；这会丢失本机配置、收藏和观看历史。已有导出备份可在重新进入后导入。'}</p>
    </details>
  );
}

function LockIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path strokeLinecap="round" d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
    </svg>
  );
}

function useRetryCountdown(retryAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= retryAt) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : '暂时无法访问本机密码，请重试。';
}
