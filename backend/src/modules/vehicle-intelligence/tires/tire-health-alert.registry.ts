import { createHash } from 'crypto';
import type { TireDisplayMode } from './tire-status';
import type {
  TireAlertSeverity,
  TireHealthAlertReasonCode,
  TireHealthAlertType,
} from './tire-health-alert.types';

export interface TireAlertMessageParams {
  position?: string | null;
  value?: number | null;
  displayMode: TireDisplayMode;
  label?: string;
}

const MESSAGES: Record<
  TireHealthAlertReasonCode,
  {
    de: (p: TireAlertMessageParams) => string;
    en: (p: TireAlertMessageParams) => string;
    actionDe: string;
    actionEn: string;
  }
> = {
  TREAD_CRITICAL_MEASURED: {
    de: (p) =>
      `${p.position ?? 'Reifen'}: Gemessene Profiltiefe ${fmt(p.value)} mm — gesetzliches Minimum erreicht`,
    en: (p) =>
      `${p.position ?? 'Tire'}: Measured tread ${fmt(p.value)} mm — at legal minimum`,
    actionDe: 'Reifen sofort prüfen und ersetzen',
    actionEn: 'Inspect and replace tires immediately',
  },
  TREAD_CRITICAL_ESTIMATED: {
    de: (p) =>
      `${p.position ?? 'Reifen'}: Geschätzte Profiltiefe kritisch (${fmt(p.value)} mm) — Messung erforderlich`,
    en: (p) =>
      `${p.position ?? 'Tire'}: Estimated tread critical (${fmt(p.value)} mm) — measurement required`,
    actionDe: 'Profiltiefe messen, bevor Sie fahren',
    actionEn: 'Measure tread depth before operating',
  },
  TREAD_LOW_MEASURED: {
    de: (p) =>
      `${p.position ?? 'Reifen'}: Gemessene Profiltiefe niedrig (${fmt(p.value)} mm) — Austausch planen`,
    en: (p) =>
      `${p.position ?? 'Tire'}: Measured tread low (${fmt(p.value)} mm) — plan replacement`,
    actionDe: 'Austausch zeitnah einplanen',
    actionEn: 'Schedule replacement soon',
  },
  TREAD_LOW_ESTIMATED: {
    de: (p) =>
      `${p.position ?? 'Reifen'}: Geschätzte Profiltiefe niedrig (${fmt(p.value)} mm) — Messung empfohlen`,
    en: (p) =>
      `${p.position ?? 'Tire'}: Estimated tread low (${fmt(p.value)} mm) — measurement recommended`,
    actionDe: 'Manuelle Messung zur Bestätigung',
    actionEn: 'Confirm with a manual measurement',
  },
  REMAINING_KM_CRITICAL: {
    de: (p) => `Restlaufzeit kritisch — ca. ${fmtKm(p.value)} km`,
    en: (p) => `Critical remaining life — about ${fmtKm(p.value)} km`,
    actionDe: 'Reifenwechsel vorbereiten',
    actionEn: 'Prepare tire replacement',
  },
  REMAINING_KM_LOW: {
    de: (p) => `Restlaufzeit niedrig — ca. ${fmtKm(p.value)} km`,
    en: (p) => `Low remaining life — about ${fmtKm(p.value)} km`,
    actionDe: 'Austausch einplanen',
    actionEn: 'Plan replacement',
  },
  WEAR_UNEVEN_CRITICAL: {
    de: (p) => `Kritische Seitenabweichung ${fmt(p.value)} mm`,
    en: (p) => `Critical side wear imbalance ${fmt(p.value)} mm`,
    actionDe: 'Achsvermessung / Spur prüfen',
    actionEn: 'Check alignment and suspension',
  },
  WEAR_UNEVEN_WARNING: {
    de: (p) => `Seitenabweichung ${fmt(p.value)} mm erkannt`,
    en: (p) => `Side wear imbalance ${fmt(p.value)} mm detected`,
    actionDe: 'Ungleichmäßigen Verschleiß prüfen',
    actionEn: 'Inspect uneven wear',
  },
  AXLE_WEAR_IMBALANCE: {
    de: (p) => `Vorder-/Hinterachse: ${fmt(p.value)} mm Differenz`,
    en: (p) => `Front/rear axle delta ${fmt(p.value)} mm`,
    actionDe: 'Rotation prüfen',
    actionEn: 'Review tire rotation',
  },
  ROTATION_OVERDUE: {
    de: () => 'Reifenrotation überfällig',
    en: () => 'Tire rotation overdue',
    actionDe: 'Rotation durchführen oder dokumentieren',
    actionEn: 'Rotate or document service',
  },
  ROTATION_RECOMMENDED: {
    de: () => 'Rotation empfohlen',
    en: () => 'Rotation recommended',
    actionDe: 'Rotation bei nächstem Service',
    actionEn: 'Rotate at next service',
  },
  PRESSURE_UNDERINFLATION_IMPACT: {
    de: () => 'Unterdruck erhöht Verschleiß — Druck prüfen',
    en: () => 'Under-inflation increasing wear — check pressures',
    actionDe: 'Reifendruck auf Solldruck bringen',
    actionEn: 'Adjust to recommended pressure',
  },
  TPMS_WARNING_ACTIVE: {
    de: () => 'TPMS-Warnung aktiv',
    en: () => 'TPMS warning active',
    actionDe: 'Reifendruck sofort prüfen',
    actionEn: 'Check tire pressure immediately',
  },
  SEASON_MISMATCH_WINTER: {
    de: () => 'Sommerreifen in der Wintersaison',
    en: () => 'Summer tires during winter season',
    actionDe: 'Winterreifen montieren',
    actionEn: 'Fit winter tires',
  },
  SEASON_MISMATCH_SUMMER: {
    de: () => 'Winterreifen in der Sommersaison',
    en: () => 'Winter tires during summer season',
    actionDe: 'Sommerreifen erwägen',
    actionEn: 'Consider summer tires',
  },
  MEASUREMENT_OVERDUE: {
    de: (p) => `Keine Profiltiefenmessung seit ${fmt(p.value)} Tagen`,
    en: (p) => `No tread measurement for ${fmt(p.value)} days`,
    actionDe: 'Messung im Werkstatt-Flow erfassen',
    actionEn: 'Record a workshop measurement',
  },
  TIRE_AGE_REPLACE: {
    de: (p) => `Reifenalter ca. ${fmt(p.value)} Jahre — Ersatz empfohlen`,
    en: (p) => `Tire age ~${fmt(p.value)} years — replacement recommended`,
    actionDe: 'DOT und Gummi prüfen',
    actionEn: 'Inspect DOT and rubber condition',
  },
  TIRE_AGE_INSPECT: {
    de: (p) => `Reifenalter ca. ${fmt(p.value)} Jahre — regelmäßig prüfen`,
    en: (p) => `Tire age ~${fmt(p.value)} years — inspect periodically`,
    actionDe: 'Zustand dokumentieren',
    actionEn: 'Document condition',
  },
  USED_TIRE_NO_MEASUREMENT: {
    de: () => 'Gebrauchtreifen ohne Messung montiert',
    en: () => 'Used tires mounted without measurement',
    actionDe: 'Profiltiefe erfassen',
    actionEn: 'Record tread depth',
  },
  LOW_CONFIDENCE_ESTIMATE: {
    de: () => 'Niedrige Schätzqualität — Messung empfohlen',
    en: () => 'Low estimate confidence — measurement recommended',
    actionDe: 'Manuelle Messung durchführen',
    actionEn: 'Perform manual measurement',
  },
  ODOMETER_ANCHOR_REQUIRED: {
    de: () => 'Kilometeranker für Restlaufzeit fehlt',
    en: () => 'Odometer anchor required for remaining-km projection',
    actionDe: 'Kilometerstand / Messung hinterlegen',
    actionEn: 'Provide odometer reading or measurement',
  },
};

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Number(v).toFixed(1);
}

function fmtKm(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('de-DE');
}

export function localizeTireAlertMessage(
  reasonCode: TireHealthAlertReasonCode,
  locale: 'de' | 'en',
  params: TireAlertMessageParams,
): string {
  const entry = MESSAGES[reasonCode];
  return locale === 'de' ? entry.de(params) : entry.en(params);
}

export function localizeTireAlertAction(
  reasonCode: TireHealthAlertReasonCode,
  locale: 'de' | 'en',
): string {
  const entry = MESSAGES[reasonCode];
  return locale === 'de' ? entry.actionDe : entry.actionEn;
}

export function hashEvidenceFingerprint(payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
}

export function buildTireAlertDedupeKey(args: {
  organizationId: string;
  vehicleId: string;
  tireSetupId: string;
  alertType: TireHealthAlertType;
  wheelPosition?: string | null;
  evidenceFingerprint: string;
}): string {
  const pos = args.wheelPosition?.trim() || '_set';
  return [
    args.organizationId,
    args.vehicleId,
    args.tireSetupId,
    args.alertType,
    pos,
    args.evidenceFingerprint,
  ].join('|');
}

/** Stable notification condition variant — one row per open alert. */
export function buildTireAlertNotificationCode(
  reasonCode: TireHealthAlertReasonCode,
  dedupeKey: string,
): string {
  return `${reasonCode}:${hashEvidenceFingerprint({ key: dedupeKey })}`;
}

export function reasonCodeToSeverity(
  reasonCode: TireHealthAlertReasonCode,
): TireAlertSeverity {
  if (
    reasonCode.startsWith('TREAD_CRITICAL') ||
    reasonCode === 'REMAINING_KM_CRITICAL' ||
    reasonCode === 'WEAR_UNEVEN_CRITICAL' ||
    reasonCode === 'TPMS_WARNING_ACTIVE'
  ) {
    return 'critical';
  }
  if (
    reasonCode === 'ROTATION_RECOMMENDED' ||
    reasonCode === 'TIRE_AGE_INSPECT' ||
    reasonCode === 'LOW_CONFIDENCE_ESTIMATE'
  ) {
    return 'info';
  }
  return 'warning';
}

export function isNotificationEligible(
  reasonCode: TireHealthAlertReasonCode,
): boolean {
  return (
    reasonCode !== 'LOW_CONFIDENCE_ESTIMATE' &&
    reasonCode !== 'ROTATION_RECOMMENDED'
  );
}
