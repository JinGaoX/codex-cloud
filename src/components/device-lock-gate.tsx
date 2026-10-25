'use client';

import type { ReactNode } from 'react';

/**
 * The personal app now opens directly. Keep this compatibility boundary so the
 * shared layout and future native bundle do not need a second authentication path.
 * Deliberately do not read or remove the former PIN record or any local app data.
 * Server authentication remains owned by AuthProvider.
 */
export function DeviceLockGate({ children }: { children: ReactNode }) {
  return children;
}
