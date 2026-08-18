import { AlertTriangle, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import type { StatusTone } from '../../components/patterns';
import type {
  GovernanceMfaState,
  SecurityAccessSection,
  SecurityAttentionCode,
} from './types';

export const SECURITY_ACCESS_REFRESH_MS = 60_000;
export const SECURITY_ACCESS_STALE_MS = 60_000;

export const SECURITY_ACCESS_SECTIONS: { id: SecurityAccessSection; label: string }[] = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'users', label: 'Benutzer' },
  { id: 'master-admins', label: 'Plattform-Admins' },
  { id: 'roles', label: 'Rollen' },
  { id: 'audit', label: 'Audit' },
  { id: 'security-events', label: 'Sicherheitsereignisse' },
  { id: 'own-security', label: 'Eigene Sicherheit' },
];

export { formatRelativeDe } from '../../components/patterns/format-utils';

export function mfaStateLabel(state: GovernanceMfaState): string {
  switch (state) {
    case 'ENABLED':
      return 'Aktiv';
    case 'REQUIRED':
    case 'ACTION_REQUIRED':
      return 'Erforderlich';
    case 'DISABLED':
      return 'Fehlt';
    case 'NOT_SUPPORTED':
      return 'Nicht unterstützt';
    default:
      return 'Unbekannt';
  }
}

export function mfaStateTone(state: GovernanceMfaState): StatusTone {
  switch (state) {
    case 'ENABLED':
      return 'success';
    case 'REQUIRED':
    case 'ACTION_REQUIRED':
    case 'DISABLED':
      return 'critical';
    case 'NOT_SUPPORTED':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function mfaStateIcon(state: GovernanceMfaState) {
  if (state === 'ENABLED') return ShieldCheck;
  if (state === 'DISABLED' || state === 'REQUIRED' || state === 'ACTION_REQUIRED') {
    return ShieldOff;
  }
  return ShieldAlert;
}

export function attentionCodeLabel(code: SecurityAttentionCode): string {
  switch (code) {
    case 'MFA_MISSING':
      return 'MFA fehlt';
    case 'MFA_REQUIRED':
      return 'MFA ausstehend';
    case 'ACCOUNT_LOCKED':
      return 'Gesperrt (Anmeldung)';
    case 'ACCOUNT_SUSPENDED':
      return 'Gesperrt (Mandant)';
    case 'PRIVILEGE_CHANGED':
      return 'Privileg geändert';
    default:
      return code;
  }
}

export function attentionCodeTone(code: SecurityAttentionCode): StatusTone {
  switch (code) {
    case 'MFA_MISSING':
    case 'ACCOUNT_LOCKED':
      return 'critical';
    case 'MFA_REQUIRED':
    case 'ACCOUNT_SUSPENDED':
      return 'warning';
    default:
      return 'info';
  }
}

export function attentionCodeIcon(code: SecurityAttentionCode) {
  if (code === 'MFA_MISSING' || code === 'MFA_REQUIRED') return ShieldOff;
  return AlertTriangle;
}

export function auditResultLabel(result: string): string {
  if (result === 'success') return 'Erfolg';
  if (result === 'failure') return 'Fehler';
  return String(result);
}

export function auditResultTone(result: string): StatusTone {
  if (result === 'success') return 'success';
  if (result === 'failure') return 'critical';
  return 'neutral';
}

export function maskIpDisplay(ip: string | null | undefined): string {
  if (!ip) return '—';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  }
  if (ip.includes(':')) return `${ip.slice(0, 8)}…`;
  return ip;
}

export function truncateReason(reason: string | null | undefined, max = 40): string {
  if (!reason) return '—';
  return reason.length <= max ? reason : `${reason.slice(0, max)}…`;
}
