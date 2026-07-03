import type { AccountSessionDto } from '../../../../lib/api';
import { formatAccountDate } from './account-utils';

export function parseOsFromUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/iPhone|iPad|iOS/i.test(ua)) return /iPad/i.test(ua) ? 'iPadOS' : 'iOS';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}

export function formatDeviceTypeLabel(
  device: string | null | undefined,
  ua: string | null | undefined,
): string {
  const normalized = device?.trim();
  if (normalized === 'Mobile' || normalized === 'Tablet' || normalized === 'Desktop') {
    return normalized;
  }
  if (!ua) return 'Desktop';
  if (/iPad|Tablet/i.test(ua)) return 'Tablet';
  if (/Mobile|Android|iPhone/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

export function formatSessionIdentity(session: AccountSessionDto): string {
  const browser = session.browser?.trim() || 'Browser';
  const os =
    session.os?.trim() ||
    parseOsFromUserAgent(session.userAgent) ||
    'Unbekanntes System';
  const deviceType = formatDeviceTypeLabel(session.device, session.userAgent);
  return `${browser} · ${os} · ${deviceType}`;
}

export function formatSessionLastActivity(session: AccountSessionDto): string {
  return formatAccountDate(session.lastUsedAt ?? session.createdAt);
}

export function formatSessionIpCompact(ip: string | null | undefined): string | null {
  const trimmed = ip?.trim();
  return trimmed || null;
}
