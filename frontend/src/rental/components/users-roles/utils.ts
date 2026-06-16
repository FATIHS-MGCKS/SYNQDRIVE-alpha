import type { OrgUserDto, OrganizationInviteDto } from '../../../lib/api';
import { PERMISSION_MODULES, MEMBERSHIP_ROLE_LABELS, type PermissionLevel } from './constants';

export function getInitials(name: string | null | undefined, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return name.slice(0, 2).toUpperCase();
  }
  return email ? email.slice(0, 2).toUpperCase() : '??';
}

export function formatDateTime(iso: string | null | undefined): string {
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
    return iso;
  }
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function extractApiError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < length; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

export function userDisplayRole(user: OrgUserDto): string {
  if (user.organizationRoleName?.trim()) return user.organizationRoleName;
  if (user.roleLabel?.trim()) return user.roleLabel;
  return MEMBERSHIP_ROLE_LABELS[user.roleKey] ?? user.role;
}

export function userStationLabel(
  user: OrgUserDto,
  stationNameById: Map<string, string>,
): string {
  const ids = user.stationIds ?? [];
  if (ids.length > 0) {
    const names = ids.map((id) => stationNameById.get(id) ?? id).filter(Boolean);
    return names.length ? names.join(', ') : `${ids.length} Station(en)`;
  }
  if (user.stationScope?.trim()) return user.stationScope;
  return 'Alle Stationen';
}

export function inviteStationLabel(invite: OrganizationInviteDto): string {
  const ids = invite.stationIds ?? [];
  if (ids.length > 0) {
    return ids.length === 1 ? '1 Standort' : `${ids.length} Standorte`;
  }
  if (invite.stationScope?.trim()) return invite.stationScope;
  return 'Alle Standorte';
}

export function isScopedUser(user: OrgUserDto): boolean {
  return Boolean(user.stationScope?.trim()) || (user.stationIds?.length ?? 0) > 0;
}

export function isOrgAdmin(user: OrgUserDto): boolean {
  return user.roleKey === 'ORG_ADMIN' || user.membershipRole === 'ORG_ADMIN';
}

export function permissionLevelLabel(level: PermissionLevel): string {
  switch (level) {
    case 'manage':
      return 'Verwalten';
    case 'write':
      return 'Bearbeiten';
    case 'read':
      return 'Lesen';
    default:
      return 'Kein Zugriff';
  }
}

export function buildPermissionSummaryLines(
  permissions: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
  max = 8,
): string[] {
  if (!permissions) return ['Keine Berechtigungsdaten verfügbar.'];
  const lines: string[] = [];
  for (const mod of PERMISSION_MODULES) {
    const p = permissions[mod.key];
    if (!p?.read && !p?.write && !p?.manage) continue;
    if (p.manage) {
      lines.push(`Darf ${mod.label} vollständig verwalten`);
    } else if (p.write) {
      lines.push(`Darf ${mod.label} sehen und bearbeiten`);
    } else if (p.read) {
      lines.push(`Darf ${mod.label} nur lesen`);
    }
    if (lines.length >= max) break;
  }
  if (!lines.length) return ['Kein Modulzugriff konfiguriert.'];
  return lines;
}

export function formatInviteStatus(
  status: string | null | undefined,
): string {
  switch (status) {
    case 'PENDING':
      return 'Ausstehend';
    case 'ACCEPTED':
      return 'Angenommen';
    case 'EXPIRED':
      return 'Abgelaufen';
    case 'REVOKED':
      return 'Widerrufen';
    default:
      return status?.trim() ? status : '—';
  }
}

export function isLastOrgAdminError(message: string): boolean {
  return /organization admin is required/i.test(message);
}

export function describePermissionChange(
  before: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
  after: Record<string, { read: boolean; write: boolean; manage?: boolean }> | null,
): string[] {
  const warnings: string[] = [];
  for (const mod of PERMISSION_MODULES) {
    const b = before?.[mod.key];
    const a = after?.[mod.key];
    const hadAccess = Boolean(b?.read || b?.write || b?.manage);
    const hasAccess = Boolean(a?.read || a?.write || a?.manage);
    if (hadAccess && !hasAccess) {
      warnings.push(`Du entziehst diesem Benutzer den Zugriff auf „${mod.label}".`);
    }
  }
  return warnings;
}
