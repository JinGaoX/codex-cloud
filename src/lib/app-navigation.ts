/** App-wide actions share the existing panels instead of navigating away. */
export type AppPanel = 'settings' | 'history' | 'favorites';
export const APP_PANEL_EVENT = 'libretv:open-panel';

export function requestAppPanel(panel: AppPanel): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AppPanel>(APP_PANEL_EVENT, { detail: panel }));
  }
}
