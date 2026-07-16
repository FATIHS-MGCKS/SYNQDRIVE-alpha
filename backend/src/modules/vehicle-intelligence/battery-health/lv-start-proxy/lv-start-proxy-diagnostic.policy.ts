import type { BatteryMeasurementQuality } from '@prisma/client';
import { isStartWindowCollectionEnabled } from '@config/battery-health-v2.config';
import type { BatteryDriveProfile } from '../battery-v2-domain';
import type { StartProxyTargetMessart } from './battery-start-proxy-measurements';
import type { BatteryHealthStatus } from '../battery-status';

export const LV_START_PROXY_DIAGNOSTIC_CONTEXT_MARKER = 'diagnosticOnly' as const;
export const LV_START_PROXY_UI_LABEL_DE = 'Startverhalten (geschätzt)' as const;
export const LV_START_PROXY_SCORE_WEIGHT_PERCENT = 0 as const;

export const LV_START_PROXY_BLOCKED_SIDE_EFFECTS = [
  'battery_score',
  'battery_publication',
  'rental_readiness',
  'alert',
  'task',
  'critical_warning_classification',
] as const;

export type LvStartProxyBlockedSideEffect =
  (typeof LV_START_PROXY_BLOCKED_SIDE_EFFECTS)[number];

export type LvStartProxyAvailability =
  | 'SUPPORTED'
  | 'UNSUPPORTED'
  | 'NOT_EVALUABLE';

export type LvStartProxyMessartClassification = 'PROXY' | 'EXPERIMENTAL';

export function isBatteryV2StartProxyEnabled(): boolean {
  return isStartWindowCollectionEnabled();
}

export function withLvStartProxyDiagnosticContext<T extends Record<string, unknown>>(
  context: T,
): T & { diagnosticOnly: true } {
  return {
    ...context,
    diagnosticOnly: true,
  };
}

export function isLvStartProxyDiagnosticMeasurementContext(
  context: unknown,
): context is { diagnosticOnly: true } {
  return (
    typeof context === 'object' &&
    context !== null &&
    (context as { diagnosticOnly?: unknown }).diagnosticOnly === true
  );
}

export function resolveLvStartProxyAvailability(input: {
  driveProfile: BatteryDriveProfile | string;
  startProxyAllowed: boolean;
  confirmedIceStart?: boolean;
  startProxyRequiresConfirmedIceStart?: boolean;
}): {
  availability: LvStartProxyAvailability;
  availabilityLabelDe: string;
} {
  if (!input.startProxyAllowed) {
    return {
      availability: 'UNSUPPORTED',
      availabilityLabelDe: 'Nicht unterstützt',
    };
  }

  if (
    input.startProxyRequiresConfirmedIceStart &&
    input.confirmedIceStart === false
  ) {
    return {
      availability: 'NOT_EVALUABLE',
      availabilityLabelDe: 'Nicht auswertbar',
    };
  }

  return {
    availability: 'SUPPORTED',
    availabilityLabelDe: 'Diagnostisch verfügbar',
  };
}

export function resolveLvStartProxyMessartClassification(
  messart: StartProxyTargetMessart | string,
): LvStartProxyMessartClassification {
  return messart === 'PRE_START' ? 'EXPERIMENTAL' : 'PROXY';
}

/** Proxy values never produce operational WARNING/CRITICAL on their own. */
export function resolveLvStartProxyOperationalHealthStatus(
  _startDipDrop: number | null | undefined,
): BatteryHealthStatus {
  return 'UNKNOWN';
}

export function getLvStartProxyScoreWeightPercent(): typeof LV_START_PROXY_SCORE_WEIGHT_PERCENT {
  return LV_START_PROXY_SCORE_WEIGHT_PERCENT;
}

export function isLvStartProxyReadinessEligible(): false {
  return false;
}

export function isLvStartProxyAlertEligible(): false {
  return false;
}

export function isLvStartProxyTaskEligible(): false {
  return false;
}

export function isLvStartProxyPublicationEligible(): false {
  return false;
}

export function isLvStartProxyEvidenceEligible(
  _quality: BatteryMeasurementQuality,
): false {
  return false;
}

export function isLvStartProxyOperationalSideEffectBlocked(
  sideEffect: LvStartProxyBlockedSideEffect,
): true {
  void sideEffect;
  return true;
}

export function buildLvStartProxyDiagnosticProvenance(
  base: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...base,
    diagnosticOnly: true,
    scoreWeightPercent: LV_START_PROXY_SCORE_WEIGHT_PERCENT,
    scoreEffect: false,
    evidenceEligible: false,
    publicationEligible: false,
    readinessEffect: false,
    alertEligible: false,
    taskEligible: false,
    operationalEffect: false,
  };
}
