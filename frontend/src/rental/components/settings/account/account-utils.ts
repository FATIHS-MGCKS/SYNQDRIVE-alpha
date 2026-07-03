import type {
  AccountMeDto,
  AccountNotificationCategory,
  AccountSessionDto,
} from '../../../../lib/api';

export type AccountSection = 'profile' | 'preferences' | 'notifications' | 'security';

export type NotificationRow = AccountMeDto['notifications'][number];

export interface ProfileDraft {
  firstName: string;
  lastName: string;
  phone: string;
  mobile: string;
}

export interface PreferencesDraft {
  language: 'de' | 'en';
  timezone: string;
  dateFormat: 'DD.MM.YYYY' | 'YYYY-MM-DD';
  defaultStationId: string;
  defaultLandingPage: '' | 'dashboard' | 'bookings' | 'fleet' | 'customers' | 'tasks';
}

export const LANGUAGE_OPTIONS: Array<{ value: 'de' | 'en'; label: string }> = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

export const DATE_FORMAT_OPTIONS: Array<{ value: PreferencesDraft['dateFormat']; label: string }> = [
  { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

export const TIMEZONE_OPTIONS = [
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/Paris',
  'Europe/London',
  'Europe/Amsterdam',
  'Europe/Warsaw',
  'UTC',
] as const;

export const LANDING_PAGE_OPTIONS: Array<{
  value: PreferencesDraft['defaultLandingPage'];
  label: string;
}> = [
  { value: '', label: 'Standard (Dashboard)' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'bookings', label: 'Buchungen' },
  { value: 'fleet', label: 'Flotte' },
  { value: 'customers', label: 'Kunden' },
  { value: 'tasks', label: 'Aufgaben' },
];

export function getInitials(name: string | null | undefined, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return 'U';
}

export function formatAccountDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function countPermissionGroups(
  permissions: Record<string, { read: boolean; write: boolean }> | null,
): number {
  if (!permissions) return 0;
  return Object.values(permissions).filter((p) => p?.read || p?.write).length;
}

export function profileFromAccount(data: AccountMeDto): ProfileDraft {
  return {
    firstName: data.user.firstName ?? '',
    lastName: data.user.lastName ?? '',
    phone: data.user.phone ?? '',
    mobile: data.user.mobile ?? '',
  };
}

export function preferencesFromAccount(data: AccountMeDto): PreferencesDraft {
  const lang = data.preferences.language === 'en' ? 'en' : 'de';
  const tz = data.preferences.timezone ?? 'Europe/Berlin';
  const df =
    data.preferences.dateFormat === 'YYYY-MM-DD' ? 'YYYY-MM-DD' : 'DD.MM.YYYY';
  const landing = (data.preferences.defaultLandingPage ?? '') as PreferencesDraft['defaultLandingPage'];
  return {
    language: lang,
    timezone: TIMEZONE_OPTIONS.includes(tz as (typeof TIMEZONE_OPTIONS)[number])
      ? tz
      : 'Europe/Berlin',
    dateFormat: df,
    defaultStationId: data.preferences.defaultStationId ?? '',
    defaultLandingPage: landing,
  };
}

export function cloneNotifications(rows: NotificationRow[]): NotificationRow[] {
  return rows.map((r) => ({ ...r }));
}

export function countActiveNotificationCategories(rows: NotificationRow[]): number {
  return rows.filter((r) => r.inApp || r.email || r.push || r.sms).length;
}

export function countCriticalNotificationChannels(rows: NotificationRow[]): number {
  return rows.filter((r) => r.criticalOnly && (r.inApp || r.email)).length;
}

export function isProfileDirty(saved: ProfileDraft, draft: ProfileDraft): boolean {
  return (
    saved.firstName.trim() !== draft.firstName.trim() ||
    saved.lastName.trim() !== draft.lastName.trim() ||
    (saved.phone.trim() || '') !== (draft.phone.trim() || '') ||
    (saved.mobile.trim() || '') !== (draft.mobile.trim() || '')
  );
}

export function isPreferencesDirty(
  saved: PreferencesDraft,
  draft: PreferencesDraft,
): boolean {
  return JSON.stringify(saved) !== JSON.stringify(draft);
}

export function notificationsDirty(
  saved: NotificationRow[],
  draft: NotificationRow[],
): boolean {
  return JSON.stringify(saved) !== JSON.stringify(draft);
}

export type NotificationPresetId =
  | 'org_admin_full'
  | 'critical_only'
  | 'operational'
  | 'quiet_except_security';

export function applyNotificationPreset(
  rows: NotificationRow[],
  preset: NotificationPresetId,
): NotificationRow[] {
  const next = cloneNotifications(rows);

  const setAll = (patch: Partial<NotificationRow>) =>
    next.map((r) => ({ ...r, ...patch }));

  switch (preset) {
    case 'org_admin_full':
      return next.map((r) => ({
        ...r,
        inApp: true,
        email: r.category !== 'DOCUMENTS' && r.category !== 'WEEKLY_REPORTS' ? true : r.email,
        push: ['PICKUPS_RETURNS', 'VEHICLE_HEALTH', 'DAMAGE_MISUSE'].includes(r.category),
        sms: false,
        criticalOnly: r.category === 'VEHICLE_HEALTH',
      }));
    case 'critical_only':
      return next.map((r) => ({
        ...r,
        inApp: ['VEHICLE_HEALTH', 'DAMAGE_MISUSE', 'SECURITY'].includes(r.category),
        email: ['VEHICLE_HEALTH', 'SECURITY'].includes(r.category),
        push: false,
        sms: false,
        criticalOnly: true,
      }));
    case 'operational':
      return next.map((r) => ({
        ...r,
        inApp: !['WEEKLY_REPORTS'].includes(r.category),
        email: ['BOOKINGS', 'PICKUPS_RETURNS', 'INVOICES_PAYMENTS'].includes(r.category),
        push: ['PICKUPS_RETURNS', 'TASKS', 'DAMAGE_MISUSE'].includes(r.category),
        sms: false,
        criticalOnly: r.category === 'VEHICLE_HEALTH',
      }));
    case 'quiet_except_security':
      return next.map((r) => {
        if (r.category === 'SECURITY') {
          return { ...r, inApp: true, email: true, push: false, sms: false, criticalOnly: false };
        }
        return { ...r, inApp: false, email: false, push: false, sms: false, criticalOnly: false };
      });
    default:
      return setAll({});
  }
}

export function sessionStatusLabel(status: AccountSessionDto['status']): string {
  switch (status) {
    case 'active':
      return 'Aktiv';
    case 'revoked':
      return 'Widerrufen';
    case 'expired':
      return 'Abgelaufen';
    default:
      return status;
  }
}

export function membershipStatusLabel(status: string): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED' || status === 'INACTIVE') return 'warning';
  return 'neutral';
}

export function healthScoreTone(score: number): 'success' | 'warning' | 'critical' | 'neutral' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  if (score <= 0) return 'neutral';
  return 'critical';
}

export const NOTIFICATION_CHANNELS = [
  { key: 'inApp' as const, label: 'In-App', short: 'App' },
  { key: 'email' as const, label: 'E-Mail', short: 'Mail' },
  { key: 'push' as const, label: 'Push', short: 'Push' },
  { key: 'sms' as const, label: 'SMS', short: 'SMS' },
  { key: 'criticalOnly' as const, label: 'Nur kritisch', short: 'Krit.' },
];

export function canToggleNotificationChannel(
  category: AccountNotificationCategory,
  channel: 'inApp' | 'email' | 'push' | 'sms',
  row: NotificationRow,
  nextValue: boolean,
): boolean {
  if (category !== 'SECURITY' || channel === 'push' || channel === 'sms') return true;
  if (nextValue) return true;
  if (channel === 'inApp' && !row.email) return false;
  if (channel === 'email' && !row.inApp) return false;
  return true;
}

/** Enabled delivery channels on a row (excludes the criticalOnly flag). */
export function countEnabledNotificationChannels(row: NotificationRow): number {
  return [row.inApp, row.email, row.push, row.sms].filter(Boolean).length;
}

export const SECURITY_CHANNEL_REQUIRED_MESSAGE =
  'Sicherheit benötigt mindestens In-App oder E-Mail.';

export function securityChannelBlockMessage(
  category: AccountNotificationCategory,
  channel: keyof NotificationRow,
  row: NotificationRow,
  nextValue: boolean,
): string | null {
  if (channel !== 'inApp' && channel !== 'email') return null;
  if (canToggleNotificationChannel(category, channel, row, nextValue)) return null;
  return SECURITY_CHANNEL_REQUIRED_MESSAGE;
}

export function validateProfileDraft(draft: ProfileDraft): string | null {
  if (!draft.firstName.trim()) return 'Vorname ist erforderlich';
  if (!draft.lastName.trim()) return 'Nachname ist erforderlich';
  return null;
}
