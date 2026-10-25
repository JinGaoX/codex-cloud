import { afterEach, describe, expect, it, vi } from 'vitest';

class WorkerFixture extends EventTarget {
  state = 'installed';
  postMessage = vi.fn();
}

async function setup(options: { waiting?: boolean; playing?: boolean; supported?: boolean; initialRegistrationFailure?: boolean } = {}) {
  vi.resetModules();
  const worker = new WorkerFixture();
  const registration = Object.assign(new EventTarget(), {
    waiting: options.waiting ? worker : null,
    installing: null as WorkerFixture | null,
    update: vi.fn(async () => {}),
  });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {},
    register: vi.fn(async () => registration),
    getRegistration: vi.fn(async () => options.initialRegistrationFailure ? undefined : registration),
  });
  if (options.initialRegistrationFailure) serviceWorker.register.mockRejectedValueOnce(new TypeError('temporary network outage'));
  const media = { paused: !options.playing, ended: false };
  const reload = vi.fn();
  vi.stubGlobal('navigator', options.supported === false ? {} : { serviceWorker });
  vi.stubGlobal('document', { querySelectorAll: () => [media] });
  vi.stubGlobal('window', { isSecureContext: true, location: { reload } });
  const updates = await import('./pwa-updates');
  const stop = updates.startQuietAppUpdates();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  return { updates, worker, registration, serviceWorker, media, reload, stop };
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetModules(); });

describe('quiet PWA updates', () => {
  it('prepares an update without activation or a reload until the user asks', async () => {
    const { updates, serviceWorker, worker, reload, stop } = await setup({ waiting: true });
    expect(serviceWorker.register).toHaveBeenCalledWith('/sw-standalone.js', { scope: '/', updateViaCache: 'none' });
    expect(updates.getAppUpdateState()).toEqual({ phase: 'available' });
    expect(worker.postMessage).not.toHaveBeenCalled();
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('checks for updates manually and reports failures only through its settings state', async () => {
    const { updates, registration, reload, stop } = await setup();
    await updates.checkForAppUpdate();
    expect(registration.update).toHaveBeenCalledOnce();
    expect(updates.getAppUpdateState().phase).toBe('current');
    registration.update.mockRejectedValueOnce(new Error('network refused'));
    await updates.checkForAppUpdate();
    expect(updates.getAppUpdateState()).toMatchObject({ phase: 'failed', message: expect.stringContaining('联网') });
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('registers only within the published Pages project scope', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BASE_PATH', '/codex-cloud');
    const { serviceWorker, stop } = await setup();
    expect(serviceWorker.register).toHaveBeenCalledWith('/codex-cloud/sw-standalone.js', { scope: '/codex-cloud/', updateViaCache: 'none' });
    stop();
  });

  it('retries a transient initial registration failure and observes the recovered registration', async () => {
    const { updates, serviceWorker, registration, worker, reload, stop } = await setup({ initialRegistrationFailure: true });
    expect(updates.getAppUpdateState().phase).toBe('failed');
    await updates.checkForAppUpdate();
    expect(serviceWorker.register).toHaveBeenCalledTimes(2);
    expect(serviceWorker.getRegistration).toHaveBeenCalledOnce();
    expect(registration.update).toHaveBeenCalledOnce();
    expect(updates.getAppUpdateState().phase).toBe('current');
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    registration.waiting = worker;
    worker.dispatchEvent(new Event('statechange'));
    expect(updates.getAppUpdateState().phase).toBe('available');
    expect(worker.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('refuses activation while video is playing, then activates and reloads after explicit paused action', async () => {
    const { updates, worker, serviceWorker, media, reload, stop } = await setup({ waiting: true, playing: true });
    updates.applyAppUpdate();
    expect(updates.getAppUpdateState()).toMatchObject({ phase: 'available', message: expect.stringContaining('暂停') });
    expect(worker.postMessage).not.toHaveBeenCalled();
    media.paused = true;
    updates.applyAppUpdate();
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'ACTIVATE_UPDATE' });
    expect(reload).not.toHaveBeenCalled();
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
    stop();
  });

  it('does not interrupt video that starts between the update request and controller activation', async () => {
    const { updates, serviceWorker, registration, media, reload, stop } = await setup({ waiting: true });
    updates.applyAppUpdate();
    media.paused = false;
    registration.waiting = null;
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    expect(updates.getAppUpdateState().phase).toBe('available');
    media.paused = true;
    updates.applyAppUpdate();
    expect(reload).toHaveBeenCalledOnce();
    stop();
  });

  it('keeps a manual check pending while resources install and exposes the completed update', async () => {
    const { updates, registration, worker, stop } = await setup();
    registration.update.mockImplementationOnce(async () => {
      worker.state = 'installing';
      registration.installing = worker;
      registration.dispatchEvent(new Event('updatefound'));
    });
    await updates.checkForAppUpdate();
    expect(updates.getAppUpdateState().phase).toBe('checking');
    worker.state = 'installed';
    registration.waiting = worker;
    worker.dispatchEvent(new Event('statechange'));
    expect(updates.getAppUpdateState().phase).toBe('available');
    expect(worker.postMessage).not.toHaveBeenCalled();
    stop();
  });

  it('recovers a failed activation request without throwing into the page', async () => {
    const { updates, worker, reload, stop } = await setup({ waiting: true });
    worker.postMessage.mockImplementationOnce(() => { throw new DOMException('worker no longer waiting', 'InvalidStateError'); });
    expect(() => updates.applyAppUpdate()).not.toThrow();
    expect(updates.getAppUpdateState().phase).toBe('failed');
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('allows retry after an activation stalls and never reloads from the stale request', async () => {
    vi.useFakeTimers();
    const { updates, serviceWorker, reload, stop } = await setup({ waiting: true });
    updates.applyAppUpdate();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(updates.getAppUpdateState().phase).toBe('available');
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    stop();
  });

  it('unmount removes activation listeners and unsupported browsers remain usable', async () => {
    const { updates, serviceWorker, reload, stop } = await setup({ waiting: true });
    updates.applyAppUpdate();
    stop();
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    const unsupported = await setup({ supported: false });
    expect(unsupported.updates.getAppUpdateState().phase).toBe('unsupported');
    await unsupported.updates.checkForAppUpdate();
    expect(unsupported.reload).not.toHaveBeenCalled();
    unsupported.stop();
  });
});
