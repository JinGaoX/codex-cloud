import { appPath } from './app-path';

export type AppUpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'applying' | 'failed' | 'unsupported';
export interface AppUpdateState {
  phase: AppUpdatePhase;
  /** User-triggered feedback stays inside Settings; there is no global banner. */
  message?: string;
}

const initialState: AppUpdateState = { phase: 'idle' };
let state = initialState;
const listeners = new Set<() => void>();
let registration: ServiceWorkerRegistration | undefined;
let registrationPromise: Promise<ServiceWorkerRegistration> | undefined;
let observeRegistration: ((current: ServiceWorkerRegistration) => void) | undefined;
let waiting: ServiceWorker | null = null;
let reloadRequested = false;
let reloadReady = false;
let activationTimer: ReturnType<typeof setTimeout> | undefined;

function clearActivationTimer(): void {
  if (activationTimer !== undefined) clearTimeout(activationTimer);
  activationTimer = undefined;
}

export const getAppUpdateState = () => state;
export const getServerAppUpdateState = () => initialState;
export function subscribeAppUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: AppUpdateState): void {
  state = next;
  for (const listener of listeners) listener();
}

function hasPlayingMedia(): boolean {
  return [...document.querySelectorAll<HTMLMediaElement>('video, audio')]
    .some((media) => !media.paused && !media.ended);
}

function inspectWaiting(): boolean {
  waiting = registration?.waiting ?? null;
  if (waiting && navigator.serviceWorker.controller) {
    publish({ phase: 'available' });
    return true;
  }
  return false;
}

function registerAppWorker(): Promise<ServiceWorkerRegistration> {
  if (registrationPromise) return registrationPromise;
  const pending = navigator.serviceWorker.register(appPath('/sw-standalone.js'), {
    scope: appPath('/'), updateViaCache: 'none',
  });
  registrationPromise = pending;
  // A transient initial network failure must not poison every later manual check.
  void pending.catch(() => {
    if (registrationPromise === pending) registrationPromise = undefined;
  });
  return pending;
}

/** Register and prepare public app files silently; never interrupt a playing video. */
export function startQuietAppUpdates(): () => void {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    publish({ phase: 'unsupported' });
    return () => {};
  }
  let disposed = false;
  const removeListeners: (() => void)[] = [];
  const onControllerChange = () => {
    if (!reloadRequested) return;
    clearActivationTimer();
    reloadRequested = false;
    if (hasPlayingMedia()) {
      reloadReady = true;
      publish({ phase: 'available', message: '新版已准备好，请暂停视频后重新打开。' });
      return;
    }
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
  removeListeners.push(() => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange));

  const observed = new WeakSet<ServiceWorkerRegistration>();
  const observe = (current: ServiceWorkerRegistration) => {
    if (disposed) return;
    registration = current;
    if (observed.has(current)) return;
    observed.add(current);
    const inspectInstalling = () => {
      const worker = current.installing;
      if (!worker) return;
      const onStateChange = () => {
        if (disposed || inspectWaiting()) return;
        if (worker.state === 'activated') publish({ phase: 'current' });
        else if (worker.state === 'redundant' && state.phase === 'checking') publish({ phase: 'failed' });
      };
      worker.addEventListener('statechange', onStateChange);
      removeListeners.push(() => worker.removeEventListener('statechange', onStateChange));
    };
    current.addEventListener('updatefound', inspectInstalling);
    removeListeners.push(() => current.removeEventListener('updatefound', inspectInstalling));
    inspectInstalling();
    inspectWaiting();
  };
  observeRegistration = observe;
  void registerAppWorker().then(observe).catch(() => {
    if (!disposed) publish({ phase: 'failed' });
  });

  return () => {
    disposed = true;
    reloadRequested = false;
    if (observeRegistration === observe) observeRegistration = undefined;
    clearActivationTimer();
    for (const remove of removeListeners) remove();
  };
}

/** Status is shown only in the update settings panel the user opened. */
export async function checkForAppUpdate(): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    publish({ phase: 'unsupported' });
    return;
  }
  if (state.phase === 'checking' || state.phase === 'applying') return;
  publish({ phase: 'checking' });
  try {
    if (!registration) {
      // Existing offline installs may have a usable registration even if register
      // could not refresh its script on startup. New installs can retry normally.
      registration = await navigator.serviceWorker.getRegistration(appPath('/'));
      registration ??= await registerAppWorker();
      observeRegistration?.(registration);
    }
    await registration.update();
    if (!inspectWaiting() && !registration.installing) {
      publish({ phase: reloadReady ? 'available' : 'current' });
    }
  } catch {
    publish({ phase: 'failed', message: '暂时无法检查更新，请联网后重试。' });
  }
}

/** Explicit activation only; a controller update from another tab never reloads this one. */
export function applyAppUpdate(): void {
  if (hasPlayingMedia()) {
    publish({ phase: 'available', message: '请先暂停视频，再更新应用。' });
    return;
  }
  if (reloadReady) {
    reloadReady = false;
    window.location.reload();
    return;
  }
  waiting = registration?.waiting ?? waiting;
  if (!waiting) return;
  // A different tab may already have activated this worker. This click still
  // explicitly opts this paused page into reloading its prepared app resources.
  if (waiting.state === 'activated') {
    window.location.reload();
    return;
  }
  reloadRequested = true;
  publish({ phase: 'applying' });
  clearActivationTimer();
  activationTimer = setTimeout(() => {
    reloadRequested = false;
    publish({ phase: 'available', message: '暂未完成更新，可以稍后重试。' });
  }, 15_000);
  try {
    waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  } catch {
    clearActivationTimer();
    reloadRequested = false;
    publish({ phase: 'failed', message: '暂未完成更新，请重新检查。' });
  }
}
