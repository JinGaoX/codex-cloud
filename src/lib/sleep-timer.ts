/** A wall-clock timer local to this browser tab; it never touches settings or playback history. */
export const SLEEP_TIMER_STORAGE_KEY = 'libretv-sleep-timer-v1';
export const SLEEP_TIMER_MINUTES = [15, 30, 60, 90] as const;
export type SleepTimerMinutes = (typeof SLEEP_TIMER_MINUTES)[number];
export type SleepTimerState =
  | { mode: 'off' }
  | { mode: 'deadline'; endsAt: number }
  | { mode: 'episode' }
  | { mode: 'stopped'; reason: 'deadline' | 'episode' };

interface TimerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const OFF: SleepTimerState = { mode: 'off' };

function readState(storage: TimerStorage | undefined, now: number): SleepTimerState {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SLEEP_TIMER_STORAGE_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return OFF;
    const value = raw as Record<string, unknown>;
    if (value.mode === 'episode') return { mode: 'episode' };
    if (value.mode === 'deadline' && typeof value.endsAt === 'number' && Number.isFinite(value.endsAt)
      && value.endsAt > 0 && value.endsAt <= now + 24 * 60 * 60_000) {
      return value.endsAt <= now ? { mode: 'stopped', reason: 'deadline' } : { mode: 'deadline', endsAt: value.endsAt };
    }
    if (value.mode === 'stopped' && (value.reason === 'deadline' || value.reason === 'episode')) {
      return { mode: 'stopped', reason: value.reason };
    }
  } catch { /* Disabled storage must not prevent playback or timer use in memory. */ }
  return OFF;
}

/** Clock and storage are injected so throttling, reloads and failures can be tested without media mocks. */
export class SleepTimer {
  private state: SleepTimerState;
  private listeners = new Set<() => void>();

  constructor(private readonly storage?: TimerStorage, private readonly now: () => number = Date.now) {
    this.state = readState(storage, now());
  }

  getState = (): SleepTimerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private set(next: SleepTimerState): SleepTimerState {
    this.state = next;
    try {
      if (next.mode === 'off') this.storage?.removeItem(SLEEP_TIMER_STORAGE_KEY);
      else this.storage?.setItem(SLEEP_TIMER_STORAGE_KEY, JSON.stringify(next));
    } catch { /* The in-memory timer still works if Safari refuses session storage. */ }
    this.listeners.forEach((listener) => listener());
    return next;
  }

  start(minutes: SleepTimerMinutes): SleepTimerState {
    if (!(SLEEP_TIMER_MINUTES as readonly number[]).includes(minutes)) throw new Error('不支持的定时时长');
    return this.set({ mode: 'deadline', endsAt: this.now() + minutes * 60_000 });
  }

  stopAfterEpisode(): SleepTimerState { return this.set({ mode: 'episode' }); }

  cancel(): SleepTimerState { return this.set(OFF); }

  /** Called before any play attempt and after suspended timers regain execution. */
  check = (): SleepTimerState => {
    if (this.state.mode === 'deadline' && this.now() >= this.state.endsAt) {
      return this.set({ mode: 'stopped', reason: 'deadline' });
    }
    return this.state;
  };

  finishEpisode(): SleepTimerState {
    if (this.check().mode === 'episode') return this.set({ mode: 'stopped', reason: 'episode' });
    return this.state;
  }

  canPlay = (): boolean => this.check().mode !== 'stopped';
}

let browserTimer: SleepTimer | undefined;

export function getSleepTimer(): SleepTimer {
  if (typeof window === 'undefined') return new SleepTimer();
  if (!browserTimer) {
    let storage: Storage | undefined;
    try { storage = window.sessionStorage; } catch { /* Memory fallback. */ }
    browserTimer = new SleepTimer(storage);
  }
  return browserTimer;
}

export function sleepTimerLabel(state: SleepTimerState, now = Date.now()): string {
  if (state.mode === 'off') return '定时停止';
  if (state.mode === 'episode') return '本集结束后停止';
  if (state.mode === 'stopped') return '定时已停止';
  const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `剩余 ${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
