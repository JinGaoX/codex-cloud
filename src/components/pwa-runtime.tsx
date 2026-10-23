'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { APP_BRAND } from '@/lib/app-brand';
import { IS_NATIVE, IS_STANDALONE } from '@/lib/runtime-mode';
import { Drawer } from './drawer';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/** Safari has no install API: keep the real Share → Add to Home Screen instructions available. */
export function InstallAppButton() {
  return IS_NATIVE ? null : <WebInstallAppButton />;
}

function WebInstallAppButton() {
  const [standalone, setStandalone] = useState(true);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [storageNote, setStorageNote] = useState('');

  useEffect(() => {
    setStandalone(isStandalone());
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setStandalone(true);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (standalone) return null;
  return (
    <>
      <button
        className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
        title="安装应用"
        aria-label="安装应用"
        onClick={() => setOpen(true)}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3M12 3v12m-4-4 4 4 4-4" />
        </svg>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={`安装 ${APP_BRAND.shortName}`}>
        <div className="space-y-5 text-sm leading-7 text-muted">
          <section>
            <h3 className="font-semibold text-content mb-2">iPhone / iPad</h3>
            <ol className="list-decimal pl-5 space-y-2">
              <li>在 Safari 中打开本应用的 HTTPS 地址。</li>
              <li>点 Safari 的「分享」按钮，再选「添加到主屏幕」。新版本系统中请保留「作为网页 App 打开」。</li>
              <li>确认名称并添加，然后从主屏幕图标启动，即可以独立界面使用。</li>
            </ol>
            <p className="mt-3">已安装后，请从主屏幕打开。Safari 标签页仍会显示浏览器工具栏。{IS_STANDALONE && '从主屏幕首次启动时也请联网，等底部“正在保存应用”提示消失后再离线使用；Safari 与主屏幕的缓存可能独立。'}</p>
            {IS_STANDALONE && <a className="inline-block mt-3 text-accent underline underline-offset-4" href="/install.html">完整安装步骤与备用桌面图标</a>}
          </section>
          <section>
            <h3 className="font-semibold text-content mb-2">安卓 / 其他设备</h3>
            <p>在浏览器菜单中选择「安装应用」或「添加到主屏幕」。</p>
            {prompt && (
              <button className="btn-primary mt-3" onClick={async () => {
                await prompt.prompt();
                const choice = await prompt.userChoice;
                setPrompt(null);
                if (choice.outcome === 'accepted') setOpen(false);
              }}>安装应用</button>
            )}
          </section>
          <section>
            <h3 className="font-semibold text-content mb-2">保留本地记录</h3>
            <p>设置、收藏和进度保存在当前设备。请先安装，再在主屏幕 App 中配置；Safari 和主屏幕 App 的本地数据可能独立。定期到设置中导出配置和记录，清除网站数据或卸载可能丢失本机记录。</p>
            <button className="btn-ghost mt-3" onClick={async () => {
              try {
                const granted = await navigator.storage?.persist?.();
                setStorageNote(granted ? '浏览器已授予持久存储；仍建议定期导出备份。' : '此浏览器未授予持久存储，请定期导出备份。');
              } catch {
                setStorageNote('此浏览器暂不支持持久存储申请，请定期导出备份。');
              }
            }}>申请保留本地数据</button>
            {storageNote && <p role="status" className="mt-2">{storageNote}</p>}
          </section>
          <p>{IS_STANDALONE
            ? '首次联网打开后，应用会完整保存界面到本机。设置、收藏和历史可离线查看；搜索与在线播放仍需联网，并使用支持浏览器直连的 HTTPS 数据源。'
            : '搜索和在线播放需要网络及云端服务；安装到主屏幕不会把视频下载到手机。'}</p>
        </div>
      </Drawer>
    </>
  );
}

/** Server mode caches public assets; the standalone build also saves its public static shell. */
export function PwaRuntime() {
  return IS_NATIVE ? <NativeConnectivityStatus /> : <WebPwaRuntime />;
}

/** Native resources ship inside the app; no web worker or online update is needed. */
function NativeConnectivityStatus() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="pwa-status fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-line px-4 py-2 text-center text-sm text-muted" role="status">
      已离线，可查看本机收藏、历史和设置；搜索和在线播放需联网。
    </div>
  );
}

function WebPwaRuntime() {
  const pathname = usePathname();
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offlineInstall, setOfflineInstall] = useState<'saving' | 'ready' | 'failed'>('saving');
  const updateRequested = useRef(false);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      if (IS_STANDALONE) setOfflineInstall('failed');
      return;
    }
    let disposed = false;
    const onControllerChange = () => {
      // Another tab can activate an update; don't reload an ongoing player in this tab.
      if (updateRequested.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    const workerPath = IS_STANDALONE ? '/sw-standalone.js' : '/sw.js';
    void navigator.serviceWorker.register(workerPath, { scope: '/', updateViaCache: 'none' })
      .then((registration) => {
        const checkWaiting = () => {
          if (!disposed && registration.waiting && navigator.serviceWorker.controller) {
            setWaiting(registration.waiting);
          }
        };
        const inspectInstall = () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            checkWaiting();
            if (!disposed && worker.state === 'activated' && worker.scriptURL.endsWith(workerPath)) setOfflineInstall('ready');
            if (!disposed && worker.state === 'redundant' && !registration.active?.scriptURL.endsWith(workerPath)) setOfflineInstall('failed');
          });
        };
        checkWaiting();
        inspectInstall();
        // ready is resolved only after a complete install and activation, not when register() returns.
        void navigator.serviceWorker.ready.then((ready) => {
          if (!disposed && ready.active?.scriptURL.endsWith(workerPath)) setOfflineInstall('ready');
        });
        registration.addEventListener('updatefound', () => {
          inspectInstall();
        });
      })
      // A blocked Service Worker must not prevent search, login or playback.
      .catch(() => { if (!disposed && IS_STANDALONE) setOfflineInstall('failed'); });
    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const showInstallState = IS_STANDALONE && pathname === '/' && offlineInstall !== 'ready';
  if (!offline && !showInstallState && (!waiting || pathname !== '/')) return null;
  return (
    <div className="pwa-status fixed inset-x-0 bottom-0 z-40 bg-surface border-t border-line px-4 py-2 text-center text-sm text-muted" role="status">
      {offline ? (IS_STANDALONE
        ? '已离线，可查看本地收藏、历史和设置；搜索和在线播放需联网。'
        : '当前已离线，搜索和在线播放需联网后继续。') : waiting ? (
        <span>
          应用更新已就绪。
          <button className="text-accent underline ml-2 min-h-10" onClick={() => {
            updateRequested.current = true;
            waiting?.postMessage({ type: 'ACTIVATE_UPDATE' });
          }}>更新并重新打开</button>
        </span>
      ) : offlineInstall === 'failed'
        ? '本机应用资源尚未保存成功，请保持联网并重新打开。可尝试释放存储空间后重试。'
        : '正在将应用保存到本机，请保持联网片刻；完成后可离线打开界面。'}
    </div>
  );
}
