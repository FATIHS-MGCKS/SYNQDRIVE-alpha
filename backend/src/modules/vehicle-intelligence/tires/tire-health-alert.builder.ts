import { TireChangeType } from '@prisma/client';
import { isPredictionCapable } from './tire-odometer-anchor';
import type { TireDimoContext } from './tire-dimo-context.types';
import type { TirePressureContext } from './tire-pressure-context.types';
import {
  alertTypeToCode,
  classifyMeasurementOverdue,
  classifySeasonStatus,
  classifyTireAgeYears,
  classifyTreadStatus,
  dotAgeYears,
  type TireDisplayMode,
} from './tire-status';
import { TIRE_HEALTH_CONFIG, isStaggeredSetup } from './tire-health.config';
import type { StructuredTireAlertCandidate } from './tire-health-alert.types';
import {
  buildTireAlertDedupeKey,
  hashEvidenceFingerprint,
  isNotificationEligible,
  localizeTireAlertMessage,
  reasonCodeToSeverity,
} from './tire-health-alert.registry';
import type { TireHealthAlertReasonCode, TireHealthAlertType } from './tire-health-alert.types';

export interface BuildTireHealthAlertsInput {
  organizationId: string;
  vehicleId: string;
  setup: {
    id: string;
    tireSeason?: string | null;
    tireCondition?: string | null;
    isStaggered?: boolean | null;
    totalKmOnSet?: number | null;
    installedOdometerKm?: number | null;
    dotCodeFront?: string | null;
    dotCodeRear?: string | null;
    measurements?: Array<{ measuredAt: Date | string }> | null;
    odometerAnchorStatus?: string | null;
  };
  wearAnalysis: {
    frontLeftMm: number;
    frontRightMm: number;
    rearLeftMm: number;
    rearRightMm: number;
    estimatedRemainingKm: number;
    operationalReplacementMm?: number | null;
    factors?: {
      pressureFactorFront?: number;
      pressureFactorRear?: number;
    };
    explainability?: { currentTreadSource?: string | null };
  };
  displayMode: TireDisplayMode;
  confidenceScore: number;
  pressureContext: TirePressureContext;
  kmSinceLastRotation?: number | null;
  dimoContext?: TireDimoContext | null;
}

function finalizeCandidate(
  args: BuildTireHealthAlertsInput,
  partial: Omit<
    StructuredTireAlertCandidate,
    'dedupeKey' | 'evidenceFingerprint' | 'severity' | 'notifyEligible' | 'code' | 'templateParams'
  > & { reasonCode: TireHealthAlertReasonCode },
): StructuredTireAlertCandidate {
  const evidenceFingerprint = hashEvidenceFingerprint({
    alertType: partial.alertType,
    reasonCode: partial.reasonCode,
    wheelPosition: partial.wheelPosition ?? null,
    value: partial.value ?? null,
    displayMode: partial.displayMode,
    pressureTimestamp: partial.pressureContext?.sourceTimestamp ?? null,
  });
  const dedupeKey = buildTireAlertDedupeKey({
    organizationId: args.organizationId,
    vehicleId: args.vehicleId,
    tireSetupId: args.setup.id,
    alertType: partial.alertType,
    wheelPosition: partial.wheelPosition,
    evidenceFingerprint,
  });
  const messageParams = {
    position: partial.wheelPosition,
    value: partial.value,
    displayMode: partial.displayMode,
  };
  return {
    ...partial,
    code: alertTypeToCode(partial.alertType),
    severity: reasonCodeToSeverity(partial.reasonCode),
    evidenceFingerprint,
    dedupeKey,
    notifyEligible: isNotificationEligible(partial.reasonCode),
    templateParams: {
      messageDe: localizeTireAlertMessage(partial.reasonCode, 'de', messageParams),
      messageEn: localizeTireAlertMessage(partial.reasonCode, 'en', messageParams),
      reasonCode: partial.reasonCode,
      alertType: partial.alertType,
      displayMode: partial.displayMode,
      wheelPosition: partial.wheelPosition ?? null,
      value: partial.value ?? null,
    },
  };
}

export function buildTireHealthAlerts(
  input: BuildTireHealthAlertsInput,
): StructuredTireAlertCandidate[] {
  const alerts: StructuredTireAlertCandidate[] = [];
  const cfg = TIRE_HEALTH_CONFIG;
  const a = cfg.alerts;
  const r = cfg.rotationReview;
  const operationalReplace =
    input.wearAnalysis.operationalReplacementMm ?? cfg.defaultReplaceThresholdMm;
  const measured = input.displayMode === 'MEASURED';

  const wheels = [
    { pos: 'FL', mm: input.wearAnalysis.frontLeftMm },
    { pos: 'FR', mm: input.wearAnalysis.frontRightMm },
    { pos: 'RL', mm: input.wearAnalysis.rearLeftMm },
    { pos: 'RR', mm: input.wearAnalysis.rearRightMm },
  ];

  for (const w of wheels) {
    const treadStatus = classifyTreadStatus(w.mm, input.setup.tireSeason);
    if (treadStatus === 'CRITICAL') {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'CRITICAL_TREAD',
          reasonCode: measured ? 'TREAD_CRITICAL_MEASURED' : 'TREAD_CRITICAL_ESTIMATED',
          displayMode: input.displayMode,
          wheelPosition: w.pos,
          value: w.mm,
        }),
      );
    } else if (treadStatus === 'WARNING' || w.mm <= operationalReplace + 0.3) {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'LOW_TREAD',
          reasonCode: measured ? 'TREAD_LOW_MEASURED' : 'TREAD_LOW_ESTIMATED',
          displayMode: input.displayMode,
          wheelPosition: w.pos,
          value: w.mm,
        }),
      );
    }
  }

  if (input.wearAnalysis.estimatedRemainingKm <= a.criticalRemainingKm) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'CRITICAL_REMAINING_KM',
        reasonCode: 'REMAINING_KM_CRITICAL',
        displayMode: input.displayMode,
        value: input.wearAnalysis.estimatedRemainingKm,
      }),
    );
  } else if (input.wearAnalysis.estimatedRemainingKm <= a.lowRemainingKm) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'LOW_REMAINING_KM',
        reasonCode: 'REMAINING_KM_LOW',
        displayMode: input.displayMode,
        value: input.wearAnalysis.estimatedRemainingKm,
      }),
    );
  }

  const sideDeltaFront = Math.abs(
    input.wearAnalysis.frontLeftMm - input.wearAnalysis.frontRightMm,
  );
  const sideDeltaRear = Math.abs(
    input.wearAnalysis.rearLeftMm - input.wearAnalysis.rearRightMm,
  );
  for (const [label, delta] of [
    ['Front', sideDeltaFront],
    ['Rear', sideDeltaRear],
  ] as const) {
    if (delta >= a.unevenWearCriticalMm) {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'UNEVEN_WEAR_CRITICAL',
          reasonCode: 'WEAR_UNEVEN_CRITICAL',
          displayMode: input.displayMode,
          wheelPosition: label,
          value: delta,
        }),
      );
    } else if (delta >= a.unevenWearAttentionMm) {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'UNEVEN_WEAR_ATTENTION',
          reasonCode: 'WEAR_UNEVEN_WARNING',
          displayMode: input.displayMode,
          wheelPosition: label,
          value: delta,
        }),
      );
    }
  }

  const frontAvg =
    (input.wearAnalysis.frontLeftMm + input.wearAnalysis.frontRightMm) / 2;
  const rearAvg =
    (input.wearAnalysis.rearLeftMm + input.wearAnalysis.rearRightMm) / 2;
  const axleDelta = Math.abs(frontAvg - rearAvg);

  if (!isStaggeredSetup(input.setup as Parameters<typeof isStaggeredSetup>[0])) {
    const kmSinceLastRotation = input.kmSinceLastRotation ?? input.setup.totalKmOnSet ?? 0;
    if (kmSinceLastRotation >= r.overdueKm) {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'ROTATION_OVERDUE',
          reasonCode: 'ROTATION_OVERDUE',
          displayMode: input.displayMode,
          value: kmSinceLastRotation,
        }),
      );
    } else if (
      kmSinceLastRotation >= r.normalReviewKm &&
      axleDelta >= r.wearImbalanceThresholdMm
    ) {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'ROTATION_RECOMMENDED',
          reasonCode: 'ROTATION_RECOMMENDED',
          displayMode: input.displayMode,
          value: axleDelta,
        }),
      );
    }

    if (axleDelta >= a.frontRearRotationDeltaMm) {
      alerts.push(
        finalizeCandidate(input, {
          alertType: 'AXLE_WEAR_IMBALANCE',
          reasonCode: 'AXLE_WEAR_IMBALANCE',
          displayMode: input.displayMode,
          value: axleDelta,
        }),
      );
    }
  }

  if (input.confidenceScore < a.lowConfidenceThreshold) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'LOW_CONFIDENCE',
        reasonCode: 'LOW_CONFIDENCE_ESTIMATE',
        displayMode: input.displayMode,
        value: input.confidenceScore,
      }),
    );
  }

  const pressureEligible = input.pressureContext.wearEligibility.eligible;
  const pressureFresh = input.pressureContext.overallFreshness !== 'stale';
  if (
    pressureEligible &&
    pressureFresh &&
    (input.wearAnalysis.factors?.pressureFactorFront ?? 1) > 1.06
  ) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'PRESSURE_IMPACT',
        reasonCode: 'PRESSURE_UNDERINFLATION_IMPACT',
        displayMode: input.displayMode,
        pressureContext: {
          sourceLabel: input.pressureContext.sourceType,
          sourceTimestamp: input.pressureContext.coverage.periodEnd,
          freshness: input.pressureContext.overallFreshness,
          tpmsWarning: input.pressureContext.tpmsWarning,
        },
      }),
    );
  }

  if (
    input.pressureContext.tpmsWarning === true &&
    input.pressureContext.overallStatus === 'ISSUE' &&
    input.pressureContext.overallFreshness !== 'stale'
  ) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'TPMS_WARNING',
        reasonCode: 'TPMS_WARNING_ACTIVE',
        displayMode: input.displayMode,
        pressureContext: {
          sourceLabel:
            input.pressureContext.tpmsWarningSource ?? input.pressureContext.sourceType,
          sourceTimestamp: input.pressureContext.coverage.periodEnd,
          freshness: input.pressureContext.overallFreshness,
          tpmsWarning: true,
        },
      }),
    );
  }

  const seasonResult = classifySeasonStatus(
    input.setup.tireSeason,
    new Date(),
    input.dimoContext?.ambient.usable
      ? {
          weightedAvgTempC: input.dimoContext.ambient.weightedAvgTempC ?? 0,
          sampleCount: input.dimoContext.ambient.sampleCount,
          capabilityUsable: true,
        }
      : null,
  );
  if (seasonResult.mismatch && seasonResult.status === 'WARNING') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'SEASON_MISMATCH',
        reasonCode: 'SEASON_MISMATCH_WINTER',
        displayMode: input.displayMode,
      }),
    );
  } else if (seasonResult.mismatch && seasonResult.status === 'WATCH') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'SEASON_MISMATCH',
        reasonCode: 'SEASON_MISMATCH_SUMMER',
        displayMode: input.displayMode,
      }),
    );
  }

  const latestMeas = input.setup.measurements?.[0] ?? null;
  const measAgeDays = latestMeas?.measuredAt
    ? Math.floor(
        (Date.now() - new Date(latestMeas.measuredAt).getTime()) / 86400000,
      )
    : null;
  if (classifyMeasurementOverdue(measAgeDays)) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'MEASUREMENT_OVERDUE',
        reasonCode: 'MEASUREMENT_OVERDUE',
        displayMode: input.displayMode,
        value: measAgeDays,
      }),
    );
  }

  const dotAges = [
    dotAgeYears(input.setup.dotCodeFront),
    dotAgeYears(input.setup.dotCodeRear),
  ].filter((v): v is number => v != null);
  const maxAgeYears = dotAges.length > 0 ? Math.max(...dotAges) : null;
  const ageStatus = classifyTireAgeYears(maxAgeYears);
  if (ageStatus === 'WARNING') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'TIRE_AGE_WARNING',
        reasonCode: 'TIRE_AGE_REPLACE',
        displayMode: input.displayMode,
        value: maxAgeYears,
      }),
    );
  } else if (ageStatus === 'WATCH') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'TIRE_AGE_WARNING',
        reasonCode: 'TIRE_AGE_INSPECT',
        displayMode: input.displayMode,
        value: maxAgeYears,
      }),
    );
  }

  if (
    input.setup.tireCondition === 'ALREADY_MOUNTED' &&
    (!input.setup.measurements || input.setup.measurements.length === 0)
  ) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'USED_TIRE_NO_MEASUREMENT',
        reasonCode: 'USED_TIRE_NO_MEASUREMENT',
        displayMode: input.displayMode,
      }),
    );
  }

  if (!isPredictionCapable(input.setup.odometerAnchorStatus as Parameters<typeof isPredictionCapable>[0])) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'ODOMETER_ANCHOR_REQUIRED',
        reasonCode: 'ODOMETER_ANCHOR_REQUIRED',
        displayMode: input.displayMode,
      }),
    );
  }

  return dedupeCandidates(alerts);
}

function dedupeCandidates(
  alerts: StructuredTireAlertCandidate[],
): StructuredTireAlertCandidate[] {
  const byKey = new Map<string, StructuredTireAlertCandidate>();
  for (const alert of alerts) {
    byKey.set(alert.dedupeKey, alert);
  }
  return [...byKey.values()];
}

export async function resolveKmSinceLastRotation(
  prisma: {
    tirePositionHistory: {
      findFirst: (args: unknown) => Promise<{ odometerKm: number | null } | null>;
    };
  },
  vehicleId: string,
  setup: { totalKmOnSet?: number | null; installedOdometerKm?: number | null },
): Promise<number> {
  const lastRotation = await prisma.tirePositionHistory.findFirst({
    where: { vehicleId, changeType: TireChangeType.ROTATE },
    orderBy: { changedAt: 'desc' },
  });
  if (lastRotation?.odometerKm == null) {
    return setup.totalKmOnSet ?? 0;
  }
  return (
    (setup.totalKmOnSet ?? 0) -
    (lastRotation.odometerKm - (setup.installedOdometerKm ?? 0))
  );
}

export function structuredAlertsToApiAlerts(
  alerts: StructuredTireAlertCandidate[],
): Array<{
  type: string;
  code: StructuredTireAlertCandidate['code'];
  severity: StructuredTireAlertCandidate['severity'];
  message: string;
  position?: string;
  value?: number;
  reasonCode: TireHealthAlertReasonCode;
  displayMode: TireDisplayMode;
  dedupeKey: string;
}> {
  return alerts.map((a) => ({
    type: a.alertType,
    code: a.code,
    severity: a.severity,
    message: String(a.templateParams.messageDe),
    position: a.wheelPosition ?? undefined,
    value: a.value ?? undefined,
    reasonCode: a.reasonCode,
    displayMode: a.displayMode,
    dedupeKey: a.dedupeKey,
  }));
}
