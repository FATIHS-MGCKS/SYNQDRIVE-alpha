import type { NotificationSeverity } from '@prisma/client';

export interface QuietHoursConfig {
  startLocal: string;
  endLocal: string;
}

export function parseLocalTimeToMinutes(value: string): number {
  const [h, m] = value.split(':').map((part) => parseInt(part, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function isWithinQuietHours(
  referenceUtc: Date,
  timezone: string,
  config: QuietHoursConfig,
): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceUtc);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const nowMinutes = hour * 60 + minute;
  const start = parseLocalTimeToMinutes(config.startLocal);
  const end = parseLocalTimeToMinutes(config.endLocal);

  if (start === end) return false;
  if (start < end) {
    return nowMinutes >= start && nowMinutes < end;
  }
  return nowMinutes >= start || nowMinutes < end;
}

export function criticalOverridesQuietHours(severity: NotificationSeverity): boolean {
  return severity === 'CRITICAL';
}

export function nextDigestAvailableAt(
  referenceUtc: Date,
  timezone: string,
  digestHourLocal: number,
): Date {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceUtc);
  const year = parseInt(parts.find((p) => p.type === 'year')?.value ?? '1970', 10);
  const month = parseInt(parts.find((p) => p.type === 'month')?.value ?? '1', 10);
  const day = parseInt(parts.find((p) => p.type === 'day')?.value ?? '1', 10);
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);

  const localDate = new Date(Date.UTC(year, month - 1, day, hour));
  let targetDay = day;
  if (hour >= digestHourLocal) {
    targetDay += 1;
  }
  const targetLocal = new Date(Date.UTC(year, month - 1, targetDay, digestHourLocal, 0, 0));
  const offsetMs = referenceUtc.getTime() - localDate.getTime();
  return new Date(targetLocal.getTime() + offsetMs);
}
