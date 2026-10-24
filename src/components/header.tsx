'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { FavoritesPanel } from './favorites-panel';
import { InstallAppButton } from './pwa-runtime';
import { APP_BRAND } from '@/lib/app-brand';
import { requestShowDownloadManager } from './download-manager';
import { Icon } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';
import { IS_STANDALONE } from '@/lib/runtime-mode';
import { APP_PANEL_EVENT, type AppPanel } from '@/lib/app-navigation';

/** 顶部导航：Logo、搜索框（首页外）、历史、设置 */
export function Header({ showSearch = false }: { showSearch?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [query, setQuery] = useState('');
  // 与首页搜索框共用同一套「最近搜索」下拉逻辑
  const searchHistory = useSearchHistory(query);

  const openPanel = useCallback((panel: AppPanel) => {
    setSettingsOpen(panel === 'settings');
    setHistoryOpen(panel === 'history');
    setFavoritesOpen(panel === 'favorites');
  }, []);

  useEffect(() => {
    const onOpenPanel = (event: Event) => {
      const panel = (event as CustomEvent<unknown>).detail;
      if (panel === 'settings' || panel === 'history' || panel === 'favorites') openPanel(panel);
    };
    window.addEventListener(APP_PANEL_EVENT, onOpenPanel);
    return () => window.removeEventListener(APP_PANEL_EVENT, onOpenPanel);
  }, [openPanel]);

  useEffect(() => {
    if (!IS_STANDALONE) return;
    // Keep the tab bar away from the iOS keyboard. A hardware keyboard may also
    // focus an input; hiding the bar while editing still leaves more form space.
    const sync = () => {
      const active = document.activeElement;
      setInputFocused(active instanceof HTMLTextAreaElement ||
        (active instanceof HTMLInputElement && /^(text|search|password|email|url|tel|number)$/.test(active.type)) ||
        (active instanceof HTMLElement && active.isContentEditable));
    };
    const onBlur = () => queueMicrotask(sync);
    document.addEventListener('focusin', sync);
    document.addEventListener('focusout', onBlur);
    return () => {
      document.removeEventListener('focusin', sync);
      document.removeEventListener('focusout', onBlur);
    };
  }, []);

  useEffect(() => {
    // Closing a sheet can remove its focused field without dispatching blur.
    // Restore the navigation before the sheet returns focus to its trigger.
    if (!settingsOpen && !historyOpen && !favoritesOpen) setInputFocused(false);
  }, [settingsOpen, historyOpen, favoritesOpen]);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    // 顶栏搜索一并写入最近搜索（此前只有首页会记录）
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  return (
    <>
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/" aria-label={`${APP_BRAND.name} 首页`} className={cn('flex items-center shrink-0', IS_STANDALONE && 'gap-2.5 min-h-11')}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_BRAND.icons.large} alt={APP_BRAND.name} className="w-7 h-7 rounded-lg" />
            {IS_STANDALONE && <span className="md:hidden leading-tight"><span className="block font-semibold tracking-wide text-content">{APP_BRAND.shortName}</span><span className="block mt-0.5 text-[10px] text-muted">随身影院</span></span>}
          </Link>

          {showSearch && (
            <form
              className="flex-1 max-w-xl hidden sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(query);
              }}
            >
              <div ref={searchHistory.containerRef} className="relative">
                <input
                  className={cn(
                    'input w-full h-9',
                    // 展开时：上圆角与外框沿用聚焦样式，底边改为内部分隔线，与下拉拼成同一面板
                    searchHistory.visible &&
                      'rounded-b-none border-accent border-b-line bg-surface-raised focus-visible:ring-0'
                  )}
                  aria-label="搜索影片"
                  placeholder="搜索影片..."
                  value={query}
                  maxLength={100}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    searchHistory.resetActive();
                  }}
                  onFocus={searchHistory.onFocus}
                  onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                  role="combobox"
                  aria-expanded={searchHistory.visible}
                  aria-controls="header-search-history"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchHistory.visible && searchHistory.activeIndex >= 0
                      ? `header-search-history-${searchHistory.activeIndex}`
                      : undefined
                  }
                />
                {searchHistory.visible && (
                  <SearchHistoryDropdown
                    id="header-search-history"
                    matches={searchHistory.matches}
                    activeIndex={searchHistory.activeIndex}
                    onPick={pickHistory}
                    onRemove={searchHistory.remove}
                    onClearAll={searchHistory.clearAll}
                  />
                )}
              </div>
            </form>
          )}

          <div className={IS_STANDALONE ? 'flex-1 md:hidden' : 'flex-1 sm:hidden'} />

          {IS_STANDALONE && (
            <nav aria-label="应用工具" className="flex items-center ml-auto md:hidden [&_button]:min-h-11 [&_button]:min-w-11 [&_button]:inline-flex [&_button]:items-center [&_button]:justify-center">
              <Link href="/about" aria-label="关于" aria-current={pathname === '/about' ? 'page' : undefined} title="关于 LibreTV" className="w-11 h-11 inline-flex items-center justify-center rounded-xl text-muted hover:text-content hover:bg-hover">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 11v6m0-10v.1" /></svg>
              </Link>
              <ThemeToggle />
              <InstallAppButton />
            </nav>
          )}

          <nav className={cn('items-center gap-1 ml-auto', IS_STANDALONE ? 'hidden md:flex' : 'flex')}>
            {!IS_STANDALONE && <HeaderLink href="/live" active={pathname === '/live'}>
              直播
            </HeaderLink>}
            <span className={IS_STANDALONE ? 'contents' : 'hidden sm:contents'}><HeaderLink href="/about" active={pathname === '/about'}>关于</HeaderLink></span>
            <ThemeToggle />
            <InstallAppButton />
            <IconButton label="我的收藏" onClick={() => openPanel('favorites')}>
              <Icon name="heart" />
            </IconButton>
            <IconButton label="观看历史" onClick={() => openPanel('history')}>
              <Icon name="clock" />
            </IconButton>
            {!IS_STANDALONE && <span className="hidden sm:contents"><IconButton label="下载管理" onClick={requestShowDownloadManager}>
              <Icon name="download" />
            </IconButton></span>}
            <IconButton label="设置" onClick={() => openPanel('settings')}>
              <Icon name="gear" />
            </IconButton>
          </nav>
        </div>
      </header>

      {IS_STANDALONE && (
        <nav
          aria-label="主要导航"
          data-mobile-tab-bar
          className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-surface/95 backdrop-blur-xl md:hidden"
          style={{ display: inputFocused ? 'none' : undefined, paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'max(12px, env(safe-area-inset-left))', paddingRight: 'max(12px, env(safe-area-inset-right))' }}
        >
          <MobileNavItem label="首页" active={pathname === '/' && !settingsOpen && !historyOpen && !favoritesOpen} page onClick={() => {
            setSettingsOpen(false);
            setHistoryOpen(false);
            setFavoritesOpen(false);
            router.push('/');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}><Icon name="home" /></MobileNavItem>
          <MobileNavItem label="收藏" ariaLabel="我的收藏" active={favoritesOpen} onClick={() => openPanel('favorites')}><Icon name="heart" /></MobileNavItem>
          <MobileNavItem label="历史" ariaLabel="观看历史" active={historyOpen} onClick={() => openPanel('history')}><Icon name="clock" /></MobileNavItem>
          <MobileNavItem label="设置" active={settingsOpen} onClick={() => openPanel('settings')}><Icon name="gear" /></MobileNavItem>
        </nav>
      )}

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
      <FavoritesPanel open={favoritesOpen} onClose={() => setFavoritesOpen(false)} />
    </>
  );
}

function MobileNavItem({ label, ariaLabel, active, page = false, onClick, children }: {
  label: string;
  ariaLabel?: string;
  active: boolean;
  page?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel || label}
      aria-current={page && active ? 'page' : undefined}
      aria-pressed={page ? undefined : active}
      onClick={onClick}
      className={cn('relative h-16 min-w-11 flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent', active ? 'text-accent' : 'text-muted active:bg-hover')}
    >
      <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-accent/10')}>{children}</span>
      <span>{label}</span>
    </button>
  );
}

function HeaderLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'px-2.5 py-1.5 rounded-md text-sm transition-colors',
        active ? 'text-content bg-hover' : 'text-muted hover:text-content'
      )}
    >
      {children}
    </Link>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
