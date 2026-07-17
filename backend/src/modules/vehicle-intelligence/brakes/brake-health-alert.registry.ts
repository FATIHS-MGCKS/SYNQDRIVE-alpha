import { createHash } from 'crypto';
import type { BrakeAlertCode } from './brake-status';
import type {
  BrakeAlertDisplayMode,
  BrakeAlertSeverity,
  BrakeHealthAlertCategory,
  BrakeHealthAlertReasonCode,
  BrakeHealthAlertType,
} from './brake-health-alert.types';

type Locale = 'de' | 'en';

interface MessageEntry {
  de: string;
  en: string;
}

const MESSAGES: Record<BrakeHealthAlertReasonCode, MessageEntry> = {
  PAD_WARNING_MEASURED: {
    de: '{axle}: gemessene Belagstärke im Warnbereich',
    en: '{axle}: measured pad thickness in warning range',
  },
  PAD_WARNING_ESTIMATED: {
    de: '{axle}: geschätzter Belagverschleiß im Warnbereich',
    en: '{axle}: estimated pad wear in warning range',
  },
  PAD_CRITICAL_MEASURED: {
    de: '{axle}: gemessene Belagstärke kritisch — sofort prüfen/ersetzen',
    en: '{axle}: measured pad thickness critical — inspect/replace immediately',
  },
  PAD_CRITICAL_ESTIMATED: {
    de: '{axle}: geschätzter Belagverschleiß kritisch — Service einplanen',
    en: '{axle}: estimated pad wear critical — schedule service',
  },
  DISC_WARNING_MEASURED: {
    de: '{axle}: gemessene Scheibenstärke im Warnbereich',
    en: '{axle}: measured disc thickness in warning range',
  },
  DISC_WARNING_ESTIMATED: {
    de: '{axle}: geschätzter Scheibenverschleiß im Warnbereich',
    en: '{axle}: estimated disc wear in warning range',
  },
  DISC_CRITICAL_MEASURED: {
    de: '{axle}: gemessene Scheibenstärke kritisch — sofort prüfen/ersetzen',
    en: '{axle}: measured disc thickness critical — inspect/replace immediately',
  },
  DISC_CRITICAL_ESTIMATED: {
    de: '{axle}: geschätzter Scheibenverschleiß kritisch — Service einplanen',
    en: '{axle}: estimated disc wear critical — schedule service',
  },
  LOW_REMAINING_KM: {
    de: 'Geschätzte Restnutzung niedrig (~{value} km)',
    en: 'Estimated remaining life low (~{value} km)',
  },
  ABS_DTC_ACTIVE: {
    de: 'ABS-Fehlercode aktiv ({code}) — Diagnose empfohlen',
    en: 'ABS fault code active ({code}) — diagnosis recommended',
  },
  ABS_DTC_CRITICAL: {
    de: 'ABS-Fehlercode kritisch ({code}) — sofortige Diagnose',
    en: 'ABS fault code critical ({code}) — immediate diagnosis required',
  },
  BRAKE_DTC_ACTIVE: {
    de: 'Bremssystem-Fehlercode aktiv ({code}) — Diagnose empfohlen',
    en: 'Brake system fault code active ({code}) — diagnosis recommended',
  },
  BRAKE_DTC_CRITICAL: {
    de: 'Bremssystem-Fehlercode kritisch ({code}) — sofortige Diagnose',
    en: 'Brake system fault code critical ({code}) — immediate diagnosis required',
  },
  BRAKE_FLUID_CRITICAL: {
    de: 'Bremsflüssigkeit kritisch — sofort prüfen/wechseln',
    en: 'Brake fluid critical — inspect/replace immediately',
  },
  BRAKE_FLUID_WARNING: {
    de: 'Bremsflüssigkeit auffällig — prüfen/wechseln',
    en: 'Brake fluid abnormal — inspect/replace',
  },
  IMMEDIATE_REPLACEMENT_DOCUMENTED: {
    de: 'Sofortiger Bremsenersatz dokumentiert',
    en: 'Immediate brake replacement documented',
  },
  WEAR_SENSOR_ACTIVE: {
    de: 'Bremsverschleißsensor meldet Warnung',
    en: 'Brake wear sensor reporting warning',
  },
  NO_BASELINE: {
    de: 'Keine belastbare Bremsen-Baseline hinterlegt',
    en: 'No reliable brake baseline on file',
  },
  SPEC_UNCONFIRMED: {
    de: 'Brems-Spezifikation noch nicht bestätigt',
    en: 'Brake specification not yet confirmed',
  },
  COVERAGE_GAP: {
    de: 'Telemetrie-Abdeckung unvollständig — Verschleißschätzung unsicher',
    en: 'Telemetry coverage incomplete — wear estimate uncertain',
  },
  DISTANCE_CONFLICT: {
    de: 'Trip-Distanz und Kilometerstand widersprechen sich — Abgleich nötig',
    en: 'Trip distance conflicts with odometer — reconciliation required',
  },
  MEASUREMENT_REQUIRED: {
    de: 'Geringe Datenbasis — gemessene Bremswerte empfohlen',
    en: 'Low data confidence — measured brake values recommended',
  },
  STALE_EVIDENCE: {
    de: 'Bremsen-Nachweise veraltet — neue Messung empfohlen',
    en: 'Brake evidence stale — new measurement recommended',
  },
};

const AXLE_LABELS: Record<string, Record<Locale, string>> = {
  FRONT: { de: 'Vorderachse', en: 'Front axle' },
  REAR: { de: 'Hinterachse', en: 'Rear axle' },
  UNKNOWN: { de: 'Bremsen', en: 'Brakes' },
};

export function alertTypeCategory(alertType: BrakeHealthAlertType): BrakeHealthAlertCategory {
  switch (alertType) {
    case 'PAD_WARNING':
    case 'PAD_CRITICAL':
    case 'DISC_WARNING':
    case 'DISC_CRITICAL':
    case 'LOW_REMAINING_KM':
      return 'WEAR';
    case 'ABS_WARNING':
    case 'BRAKE_DTC':
    case 'BRAKE_FLUID':
    case 'IMMEDIATE_REPLACEMENT':
    case 'WEAR_SENSOR':
      return 'SAFETY';
    default:
      return 'DATA_QUALITY';
  }
}

export function alertTypeToCanonicalCode(alertType: BrakeHealthAlertType): BrakeAlertCode {
  switch (alertType) {
    case 'PAD_WARNING':
      return 'BRAKE_PAD_WARNING';
    case 'PAD_CRITICAL':
      return 'BRAKE_PAD_CRITICAL';
    case 'DISC_WARNING':
      return 'BRAKE_DISC_WARNING';
    case 'DISC_CRITICAL':
      return 'BRAKE_DISC_CRITICAL';
    case 'LOW_REMAINING_KM':
      return 'BRAKE_LOW_REMAINING_KM';
    case 'ABS_WARNING':
      return 'BRAKE_ABS_WARNING';
    case 'BRAKE_DTC':
      return 'BRAKE_SYSTEM_DTC';
    case 'BRAKE_FLUID':
      return 'BRAKE_FLUID_WARNING';
    case 'IMMEDIATE_REPLACEMENT':
      return 'BRAKE_IMMEDIATE_REPLACEMENT';
    case 'WEAR_SENSOR':
      return 'BRAKE_WEAR_SENSOR';
    case 'NO_BASELINE':
      return 'BRAKE_NO_BASELINE';
    case 'SPEC_UNCONFIRMED':
      return 'BRAKE_SPEC_UNCONFIRMED';
    case 'COVERAGE_GAP':
      return 'BRAKE_COVERAGE_GAP';
    case 'DISTANCE_CONFLICT':
      return 'BRAKE_DISTANCE_CONFLICT';
    case 'MEASUREMENT_REQUIRED':
      return 'BRAKE_MEASUREMENT_REQUIRED';
    case 'STALE_EVIDENCE':
      return 'BRAKE_STALE_EVIDENCE';
    default:
      return 'BRAKE_GENERIC';
  }
}

export function reasonCodeToSeverity(
  reasonCode: BrakeHealthAlertReasonCode,
): BrakeAlertSeverity {
  if (
    reasonCode.includes('CRITICAL') ||
    reasonCode === 'IMMEDIATE_REPLACEMENT_DOCUMENTED' ||
    reasonCode === 'BRAKE_FLUID_CRITICAL' ||
    reasonCode === 'BRAKE_DTC_CRITICAL' ||
    reasonCode === 'ABS_DTC_CRITICAL'
  ) {
    return 'critical';
  }
  if (
    reasonCode === 'NO_BASELINE' ||
    reasonCode === 'COVERAGE_GAP' ||
    reasonCode === 'MEASUREMENT_REQUIRED' ||
    reasonCode === 'STALE_EVIDENCE' ||
    reasonCode === 'SPEC_UNCONFIRMED'
  ) {
    return 'info';
  }
  return 'warning';
}

export function isNotificationEligible(reasonCode: BrakeHealthAlertReasonCode): boolean {
  return (
    reasonCode !== 'COVERAGE_GAP' &&
    reasonCode !== 'MEASUREMENT_REQUIRED' &&
    reasonCode !== 'SPEC_UNCONFIRMED' &&
    reasonCode !== 'STALE_EVIDENCE'
  );
}

export function affectsWearCondition(category: BrakeHealthAlertCategory): boolean {
  return category === 'WEAR' || category === 'SAFETY';
}

export function hashEvidenceFingerprint(payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 16);
}

export function buildBrakeAlertDedupeKey(args: {
  organizationId: string;
  vehicleId: string;
  componentInstallationId?: string | null;
  alertType: BrakeHealthAlertType;
  evidenceFingerprint: string;
  modelSnapshotId?: string | null;
}): string {
  return [
    args.organizationId,
    args.vehicleId,
    args.componentInstallationId ?? '_vehicle',
    args.alertType,
    args.evidenceFingerprint,
    args.modelSnapshotId ?? '_live',
  ].join('|');
}

export function buildBrakeAlertNotificationCode(
  reasonCode: BrakeHealthAlertReasonCode,
  dedupeKey: string,
): string {
  return `${reasonCode}:${hashEvidenceFingerprint({ key: dedupeKey })}`;
}

export function localizeBrakeAlertMessage(
  reasonCode: BrakeHealthAlertReasonCode,
  locale: Locale,
  params: {
    axle?: string | null;
    value?: number | null;
    code?: string | null;
  },
): string {
  const template = MESSAGES[reasonCode][locale === 'de' ? 'de' : 'en'];
  const axleLabel =
    AXLE_LABELS[params.axle ?? 'UNKNOWN']?.[locale] ?? AXLE_LABELS.UNKNOWN[locale];
  return template
    .replace('{axle}', axleLabel)
    .replace('{value}', params.value != null ? String(Math.round(params.value)) : '—')
    .replace('{code}', params.code?.trim() || '—');
}

export function displayModeFromBasis(
  basis: string,
  measured: boolean,
): BrakeAlertDisplayMode {
  if (measured || basis === 'MEASURED' || basis === 'DOCUMENTED') return 'MEASURED';
  if (basis === 'SENSOR') return 'SAFETY_EVIDENCE';
  if (basis === 'ESTIMATED') return 'ESTIMATED';
  return 'DATA_GAP';
}
