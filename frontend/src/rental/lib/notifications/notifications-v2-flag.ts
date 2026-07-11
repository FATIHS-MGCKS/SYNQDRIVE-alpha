export type NotificationsV2Mode = 'off' | 'shadow' | 'on';

/**
 * Frontend gate for Notification Engine V2 dashboard cutover.
 *
 * `VITE_NOTIFICATIONS_V2`:
 * - unset / `false` / `off` → V1 ActionQueue sources only
 * - `shadow` → V1 UI + background V2 fetch/compare (diagnostics only)
 * - `true` / `on` → V2 API is the sole notification box source
 */
export function getNotificationsV2Mode(): NotificationsV2Mode {
  const raw = (import.meta.env.VITE_NOTIFICATIONS_V2 ?? 'off').toString().trim().toLowerCase();
  if (raw === 'true' || raw === 'on' || raw === '1') return 'on';
  if (raw === 'shadow') return 'shadow';
  return 'off';
}

export function isNotificationsV2Active(): boolean {
  return getNotificationsV2Mode() === 'on';
}

export function isNotificationsV2Shadow(): boolean {
  return getNotificationsV2Mode() === 'shadow';
}

export function shouldUseV2NotificationSource(): boolean {
  return isNotificationsV2Active();
}

export function shouldFetchV2NotificationsInBackground(): boolean {
  const mode = getNotificationsV2Mode();
  return mode === 'on' || mode === 'shadow';
}
