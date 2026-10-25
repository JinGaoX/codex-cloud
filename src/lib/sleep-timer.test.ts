import { describe, expect, it, vi } from 'vitest';
import { SLEEP_TIMER_MINUTES, SLEEP_TIMER_STORAGE_KEY, SleepTimer, sleepTimerLabel, type SleepTimerMinutes } from './sleep-timer';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    entries,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
}

describe('sleep timer wall-clock and session state', () => {
  it.each(SLEEP_TIMER_MINUTES)('starts a %i-minute absolute deadline', (minutes) => {
    const timer = new SleepTimer(undefined, () => 1_000_000);
    expect(timer.start(minutes)).toEqual({ mode: 'deadline', endsAt: 1_000_000 + minutes * 60_000 });
    expect(timer.canPlay()).toBe(true);
  });

  it('stops at the absolute deadline even when no timer callback ran while backgrounded', () => {
    let now = 1_000_000;
    const timer = new SleepTimer(undefined, () => now);
    timer.start(15);
    now += 20 * 60_000;
    expect(timer.canPlay()).toBe(false);
    expect(timer.getState()).toEqual({ mode: 'stopped', reason: 'deadline' });
    now += 10 * 60_000;
    expect(timer.canPlay()).toBe(false);
  });

  it('keeps the same deadline across episode/source component replacements and reloads', () => {
    const storage = memoryStorage();
    let now = 1_000_000;
    const first = new SleepTimer(storage, () => now);
    first.start(30);
    now += 5 * 60_000;
    const restored = new SleepTimer(storage, () => now);
    expect(restored.getState()).toEqual(first.getState());
    expect(restored.getState()).toEqual({ mode: 'deadline', endsAt: 1_000_000 + 30 * 60_000 });
    now += 30 * 60_000;
    expect(restored.canPlay()).toBe(false);
  });

  it('expired reloads start blocked and cannot autoplay until explicit cancellation/resume', () => {
    const storage = memoryStorage();
    storage.setItem(SLEEP_TIMER_STORAGE_KEY, JSON.stringify({ mode: 'deadline', endsAt: 1000 }));
    const timer = new SleepTimer(storage, () => 2000);
    expect(timer.getState()).toEqual({ mode: 'stopped', reason: 'deadline' });
    expect(timer.canPlay()).toBe(false);
    timer.cancel();
    expect(timer.canPlay()).toBe(true);
    expect(new SleepTimer(storage, () => 3000).getState()).toEqual({ mode: 'off' });
  });

  it('stops after this episode before an automatic next-episode callback', () => {
    const storage = memoryStorage();
    const timer = new SleepTimer(storage, () => 1000);
    timer.stopAfterEpisode();
    expect(timer.canPlay()).toBe(true);
    expect(timer.finishEpisode()).toEqual({ mode: 'stopped', reason: 'episode' });
    expect(timer.canPlay()).toBe(false);
    expect(new SleepTimer(storage, () => 2000).canPlay()).toBe(false);
  });

  it('allows automatic next episodes before a duration timer deadline', () => {
    let now = 1000;
    const timer = new SleepTimer(undefined, () => now);
    timer.start(15);
    now += 60_000;
    expect(timer.finishEpisode().mode).toBe('deadline');
    expect(timer.canPlay()).toBe(true);
    now += 15 * 60_000;
    expect(timer.finishEpisode()).toEqual({ mode: 'stopped', reason: 'deadline' });
    expect(timer.canPlay()).toBe(false);
  });

  it('a new selection replaces a prior timer and cancellation touches no unrelated data', () => {
    const storage = memoryStorage();
    storage.setItem('libretv-settings', 'private source fixture');
    storage.setItem('progress-fixture', '7');
    const timer = new SleepTimer(storage, () => 1000);
    timer.start(15);
    expect(timer.stopAfterEpisode()).toEqual({ mode: 'episode' });
    expect(timer.start(60)).toEqual({ mode: 'deadline', endsAt: 3_601_000 });
    timer.cancel();
    expect(storage.entries).toEqual(new Map([['libretv-settings', 'private source fixture'], ['progress-fixture', '7']]));
  });

  it.each(['invalid json', 'null', '{}', '{"mode":"deadline","endsAt":"1000"}', '{"mode":"deadline","endsAt":-1}', '{"mode":"deadline","endsAt":999999999999999}', '{"mode":"stopped","reason":"wrong"}'])('ignores malformed session data: %s', (raw) => {
    const storage = memoryStorage();
    storage.setItem(SLEEP_TIMER_STORAGE_KEY, raw);
    expect(new SleepTimer(storage, () => 1000).getState()).toEqual({ mode: 'off' });
  });

  it('storage-denied Safari still supports an in-memory stop and cancel', () => {
    let now = 1000;
    const denied = {
      getItem: () => { throw new Error('storage denied'); },
      setItem: () => { throw new Error('storage denied'); },
      removeItem: () => { throw new Error('storage denied'); },
    };
    const timer = new SleepTimer(denied, () => now);
    timer.start(15);
    now += 15 * 60_000;
    expect(timer.canPlay()).toBe(false);
    timer.cancel();
    expect(timer.canPlay()).toBe(true);
  });

  it('rejects unsupported durations without changing the current selection', () => {
    const timer = new SleepTimer();
    timer.stopAfterEpisode();
    expect(() => timer.start(1 as SleepTimerMinutes)).toThrow('不支持');
    expect(timer.getState()).toEqual({ mode: 'episode' });
  });

  it('notifies only state transitions so one-second checks cannot rebuild a player', () => {
    let now = 1000;
    const timer = new SleepTimer(undefined, () => now);
    const listener = vi.fn();
    const unsubscribe = timer.subscribe(listener);
    timer.start(15);
    timer.check(); timer.check();
    expect(listener).toHaveBeenCalledTimes(1);
    now += 15 * 60_000;
    timer.check(); timer.check();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    timer.cancel();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('formats a remaining countdown without an early zero or negative display', () => {
    expect(sleepTimerLabel({ mode: 'off' }, 1000)).toBe('定时停止');
    expect(sleepTimerLabel({ mode: 'episode' }, 1000)).toBe('本集结束后停止');
    expect(sleepTimerLabel({ mode: 'stopped', reason: 'deadline' }, 1000)).toBe('定时已停止');
    expect(sleepTimerLabel({ mode: 'deadline', endsAt: 61_001 }, 1000)).toBe('剩余 01:01');
    expect(sleepTimerLabel({ mode: 'deadline', endsAt: 1001 }, 1000)).toBe('剩余 00:01');
    expect(sleepTimerLabel({ mode: 'deadline', endsAt: 999 }, 1000)).toBe('剩余 00:00');
  });
});
