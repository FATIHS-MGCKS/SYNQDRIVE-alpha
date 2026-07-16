import type { VehicleOperationalReadModel } from './vehicle-operational-state';
import {
  selectIsStatusReliable,
  selectOperationalState,
  selectOperationalStatus,
  selectOperationalStatusReason,
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleDataQualityState,
  type VehicleOperationalDisplayLocale,
} from './vehicle-operational-state';

export type OperationalStatusDiagnosticsAccess = {
  userRole: string | null;
  hasPermission: (module: string, level: 'read' | 'write' | 'manage') => boolean;
};

const COPY = {
  de: {
    badgeLabel: 'Status nicht verfügbar',
    explanation:
      'Der aktuelle Buchungszustand konnte nicht zuverlässig ermittelt werden.',
    refreshLabel: 'Aktualisieren',
    retryLaterHint: 'Bitte später erneut versuchen.',
    technicalDetails: 'Technische Details',
    reason: 'Grund',
    dataQualityState: 'Datenqualität',
    derivedAt: 'Abgeleitet am',
    diagnosticReasons: 'Diagnose-Hinweise',
    notAvailable: '—',
    dataQualityLabels: {
      RELIABLE: 'Zuverlässig',
      DEGRADED: 'Eingeschränkt',
      UNAVAILABLE: 'Nicht verfügbar',
    } as Record<VehicleDataQualityState, string>,
  },
  en: {
    badgeLabel: 'Status unavailable',
    explanation: 'The current booking state could not be determined reliably.',
    refreshLabel: 'Refresh',
    retryLaterHint: 'Please try again later.',
    technicalDetails: 'Technical details',
    reason: 'Reason',
    dataQualityState: 'Data quality',
    derivedAt: 'Derived at',
    diagnosticReasons: 'Diagnostic hints',
    notAvailable: '—',
    dataQualityLabels: {
      RELIABLE: 'Reliable',
      DEGRADED: 'Degraded',
      UNAVAILABLE: 'Unavailable',
    } as Record<VehicleDataQualityState, string>,
  },
} as const;

export interface UnreliableOperationalStatusDisplay {
  isUnreliable: boolean;
  badgeLabel: string;
  explanation: string;
  refreshLabel: string;
  retryLaterHint: string;
  /** Never success — neutral or watch for degraded-but-not-unknown. */
  tone: 'neutral' | 'watch';
}

export interface OperationalStatusDiagnosticField {
  key: 'reason' | 'dataQualityState' | 'derivedAt' | 'diagnosticReasons';
  label: string;
  value: string;
}

export interface OperationalStatusDiagnosticsDisplay {
  fields: OperationalStatusDiagnosticField[];
  technicalDetailsLabel: string;
}

function resolveLocale(locale?: VehicleOperationalDisplayLocale): VehicleOperationalDisplayLocale {
  return locale === 'en' ? 'en' : 'de';
}

function readDataQualityState(
  vehicle: VehicleOperationalReadModel,
): VehicleDataQualityState | null {
  return (
    vehicle.operationalState?.dataQualityState ??
    vehicle.dataQualityState ??
    null
  );
}

/** True when operational status must not be shown as Available/Reserved/Active. */
export function isOperationalStatusUnreliable(
  vehicle: VehicleOperationalReadModel,
): boolean {
  const status = selectOperationalStatus(vehicle);
  if (status === VEHICLE_OPERATIONAL_STATUS.UNKNOWN) return true;
  if (!selectIsStatusReliable(vehicle)) return true;
  const dq = readDataQualityState(vehicle);
  if (dq === VEHICLE_DATA_QUALITY_STATE.UNAVAILABLE) return true;
  return false;
}

export function resolveUnreliableOperationalStatusDisplay(
  vehicle: VehicleOperationalReadModel,
  options: { locale?: VehicleOperationalDisplayLocale } = {},
): UnreliableOperationalStatusDisplay | null {
  if (!isOperationalStatusUnreliable(vehicle)) return null;

  const locale = resolveLocale(options.locale);
  const copy = COPY[locale];
  const dq = readDataQualityState(vehicle);
  const tone =
    dq === VEHICLE_DATA_QUALITY_STATE.DEGRADED && !selectIsStatusReliable(vehicle)
      ? 'watch'
      : 'neutral';

  return {
    isUnreliable: true,
    badgeLabel: copy.badgeLabel,
    explanation: copy.explanation,
    refreshLabel: copy.refreshLabel,
    retryLaterHint: copy.retryLaterHint,
    tone,
  };
}

function sanitizeDiagnosticText(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (/stack|trace|error:\s*\w+Error/i.test(trimmed)) return null;
  if (trimmed.length > 280) return `${trimmed.slice(0, 277)}…`;
  return trimmed;
}

function formatDerivedAt(
  iso: string | null | undefined,
  locale: VehicleOperationalDisplayLocale,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function canViewOperationalStatusDiagnostics(
  access: OperationalStatusDiagnosticsAccess,
): boolean {
  if (access.userRole === 'ORG_ADMIN' || access.userRole === 'MASTER_ADMIN') {
    return true;
  }
  return access.hasPermission('data-analyse', 'read');
}

export function resolveOperationalStatusDiagnostics(
  vehicle: VehicleOperationalReadModel,
  options: { locale?: VehicleOperationalDisplayLocale } = {},
): OperationalStatusDiagnosticsDisplay | null {
  if (!isOperationalStatusUnreliable(vehicle)) return null;

  const locale = resolveLocale(options.locale);
  const copy = COPY[locale];
  const state = selectOperationalState(vehicle);
  const fields: OperationalStatusDiagnosticField[] = [];

  const reason = sanitizeDiagnosticText(selectOperationalStatusReason(vehicle));
  fields.push({
    key: 'reason',
    label: copy.reason,
    value: reason ?? copy.notAvailable,
  });

  const dq = state.dataQualityState;
  fields.push({
    key: 'dataQualityState',
    label: copy.dataQualityState,
    value: dq ? copy.dataQualityLabels[dq] ?? dq : copy.notAvailable,
  });

  const derivedAt = formatDerivedAt(state.derivedAt, locale);
  fields.push({
    key: 'derivedAt',
    label: copy.derivedAt,
    value: derivedAt ?? copy.notAvailable,
  });

  const diagnosticReasons = (state.dataQualityReasons ?? [])
    .map((entry) => sanitizeDiagnosticText(entry))
    .filter((entry): entry is string => Boolean(entry));

  fields.push({
    key: 'diagnosticReasons',
    label: copy.diagnosticReasons,
    value:
      diagnosticReasons.length > 0
        ? diagnosticReasons.join(' · ')
        : copy.notAvailable,
  });

  return {
    fields,
    technicalDetailsLabel: copy.technicalDetails,
  };
}
