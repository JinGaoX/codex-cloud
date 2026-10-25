'use client';

import { useEffect, useState } from 'react';
import { getSleepTimer, SLEEP_TIMER_MINUTES, sleepTimerLabel, type SleepTimerState } from '@/lib/sleep-timer';
import { Drawer } from './drawer';
import { Icon } from './icon';
import { cn } from '@/lib/utils';

/** Only mounted on a player page. Listeners and interval disappear on navigation away. */
export function useSleepTimer(): SleepTimerState {
  const [state, setState] = useState<SleepTimerState>({ mode: 'off' });
  useEffect(() => {
    const timer = getSleepTimer();
    const sync = () => setState(timer.check());
    const unsubscribe = timer.subscribe(sync);
    const check = () => { timer.check(); };
    sync();
    const interval = setInterval(check, 1000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(interval);
      unsubscribe();
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return state;
}

export function SleepTimerControl({ state }: { state: SleepTimerState }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    if (state.mode !== 'deadline') return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [state]);
  const label = sleepTimerLabel(state, now || Date.now());
  return (
    <>
      <button
        type="button"
        className={cn('btn-ghost min-h-11 gap-2 text-sm', state.mode !== 'off' && 'bg-accent/10 text-accent')}
        aria-label="定时停止播放"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Icon name="clock" className="size-4" />
        <span className="tabular-nums">{label}</span>
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="定时停止播放" mobileSheet width="max-w-sm">
        <div className="grid grid-cols-2 gap-3 pb-2">
          {SLEEP_TIMER_MINUTES.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className="min-h-14 rounded-xl bg-chip text-content hover:bg-hover text-base"
              onClick={() => { getSleepTimer().start(minutes); setOpen(false); }}
            >{minutes} 分钟</button>
          ))}
          <button
            type="button"
            className="col-span-2 min-h-14 rounded-xl bg-chip text-content hover:bg-hover text-base"
            onClick={() => { getSleepTimer().stopAfterEpisode(); setOpen(false); }}
          >本集结束后停止</button>
          <button
            type="button"
            className="col-span-2 min-h-12 rounded-xl text-muted hover:bg-hover text-sm"
            onClick={() => { getSleepTimer().cancel(); setOpen(false); }}
          >取消定时</button>
        </div>
      </Drawer>
    </>
  );
}
