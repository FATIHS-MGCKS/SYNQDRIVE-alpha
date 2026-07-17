import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import type {
  BuildBrakeHealthAlertsInput,
  BrakeHealthAlertReasonCode,
  StructuredBrakeAlertCandidate,
} from './brake-health-alert.types';
import {
  alertTypeCategory,
  alertTypeToCanonicalCode,
  buildBrakeAlertDedupeKey,
  displayModeFromBasis,
  hashEvidenceFingerprint,
  isNotificationEligible,
  localizeBrakeAlertMessage,
  reasonCodeToSeverity,
} from './brake-health-alert.registry';
import type { BrakeHealthAlertType } from './brake-health-alert.types';

function finalizeCandidate(
  input: BuildBrakeHealthAlertsInput,
  partial: {
    alertType: BrakeHealthAlertType;
    reasonCode: BrakeHealthAlertReasonCode;
    displayMode: StructuredBrakeAlertCandidate['displayMode'];
    axle?: 'FRONT' | 'REAR' | 'UNKNOWN' | null;
    value?: number | null;
    componentInstallationId?: string | null;
    code?: string | null;
  },
): StructuredBrakeAlertCandidate {
  const category = alertTypeCategory(partial.alertType);
  const evidenceFingerprint = hashEvidenceFingerprint({
    alertType: partial.alertType,
    reasonCode: partial.reasonCode,
    axle: partial.axle ?? null,
    value: partial.value ?? null,
    displayMode: partial.displayMode,
    code: partial.code ?? null,
  });
  const dedupeKey = buildBrakeAlertDedupeKey({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    componentInstallationId: partial.componentInstallationId,
    alertType: partial.alertType,
    evidenceFingerprint,
    modelSnapshotId: input.modelSnapshotId,
  });
  const templateParams = {
    messageDe: localizeBrakeAlertMessage(partial.reasonCode, 'de', {
      axle: partial.axle,
      value: partial.value,
      code: partial.code,
    }),
    messageEn: localizeBrakeAlertMessage(partial.reasonCode, 'en', {
      axle: partial.axle,
      value: partial.value,
      code: partial.code,
    }),
    reasonCode: partial.reasonCode,
    alertType: partial.alertType,
    category,
    displayMode: partial.displayMode,
    axle: partial.axle ?? null,
    value: partial.value ?? null,
    code: partial.code ?? null,
  };
  return {
    alertType: partial.alertType,
    category,
    reasonCode: partial.reasonCode,
    code: alertTypeToCanonicalCode(partial.alertType),
    severity: reasonCodeToSeverity(partial.reasonCode),
    displayMode: partial.displayMode,
    axle: partial.axle ?? null,
    value: partial.value ?? null,
    componentInstallationId: partial.componentInstallationId ?? null,
    evidenceFingerprint,
    dedupeKey,
    notifyEligible: isNotificationEligible(partial.reasonCode),
    templateParams,
  };
}

function pushComponentWearAlert(
  alerts: StructuredBrakeAlertCandidate[],
  input: BuildBrakeHealthAlertsInput,
  args: {
    warningType: 'PAD_WARNING' | 'DISC_WARNING';
    criticalType: 'PAD_CRITICAL' | 'DISC_CRITICAL';
    reasonWarningMeasured: BrakeHealthAlertReasonCode;
    reasonWarningEstimated: BrakeHealthAlertReasonCode;
    reasonCriticalMeasured: BrakeHealthAlertReasonCode;
    reasonCriticalEstimated: BrakeHealthAlertReasonCode;
    condition: string;
    basis: string;
    axle: 'FRONT' | 'REAR';
    componentKey: 'FRONT_PADS' | 'REAR_PADS' | 'FRONT_DISCS' | 'REAR_DISCS';
  },
) {
  if (args.condition !== 'WARNING' && args.condition !== 'CRITICAL') return;
  const measured = args.basis === 'MEASURED' || args.basis === 'DOCUMENTED';
  const reasonCode =
    args.condition === 'CRITICAL'
      ? measured
        ? args.reasonCriticalMeasured
        : args.reasonCriticalEstimated
      : measured
        ? args.reasonWarningMeasured
        : args.reasonWarningEstimated;
  alerts.push(
    finalizeCandidate(input, {
      alertType: args.condition === 'CRITICAL' ? args.criticalType : args.warningType,
      reasonCode,
      displayMode: displayModeFromBasis(args.basis, measured),
      axle: args.axle,
      componentInstallationId: input.componentInstallationIds?.[args.componentKey] ?? null,
    }),
  );
}

export function buildBrakeHealthAlerts(
  input: BuildBrakeHealthAlertsInput,
): StructuredBrakeAlertCandidate[] {
  const alerts: StructuredBrakeAlertCandidate[] = [];
  const cfg = BRAKE_HEALTH_CONFIG.alerts;

  if (!input.initialized || input.stateClass === 'NO_BASELINE') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'NO_BASELINE',
        reasonCode: 'NO_BASELINE',
        displayMode: 'DATA_GAP',
      }),
    );
  }

  pushComponentWearAlert(alerts, input, {
    warningType: 'PAD_WARNING',
    criticalType: 'PAD_CRITICAL',
    reasonWarningMeasured: 'PAD_WARNING_MEASURED',
    reasonWarningEstimated: 'PAD_WARNING_ESTIMATED',
    reasonCriticalMeasured: 'PAD_CRITICAL_MEASURED',
    reasonCriticalEstimated: 'PAD_CRITICAL_ESTIMATED',
    condition: input.frontPadCondition,
    basis: input.frontPadBasis,
    axle: 'FRONT',
    componentKey: 'FRONT_PADS',
  });
  pushComponentWearAlert(alerts, input, {
    warningType: 'PAD_WARNING',
    criticalType: 'PAD_CRITICAL',
    reasonWarningMeasured: 'PAD_WARNING_MEASURED',
    reasonWarningEstimated: 'PAD_WARNING_ESTIMATED',
    reasonCriticalMeasured: 'PAD_CRITICAL_MEASURED',
    reasonCriticalEstimated: 'PAD_CRITICAL_ESTIMATED',
    condition: input.rearPadCondition,
    basis: input.rearPadBasis,
    axle: 'REAR',
    componentKey: 'REAR_PADS',
  });

  pushComponentWearAlert(alerts, input, {
    warningType: 'DISC_WARNING',
    criticalType: 'DISC_CRITICAL',
    reasonWarningMeasured: 'DISC_WARNING_MEASURED',
    reasonWarningEstimated: 'DISC_WARNING_ESTIMATED',
    reasonCriticalMeasured: 'DISC_CRITICAL_MEASURED',
    reasonCriticalEstimated: 'DISC_CRITICAL_ESTIMATED',
    condition: input.frontDiscCondition,
    basis: input.frontDiscBasis,
    axle: 'FRONT',
    componentKey: 'FRONT_DISCS',
  });
  pushComponentWearAlert(alerts, input, {
    warningType: 'DISC_WARNING',
    criticalType: 'DISC_CRITICAL',
    reasonWarningMeasured: 'DISC_WARNING_MEASURED',
    reasonWarningEstimated: 'DISC_WARNING_ESTIMATED',
    reasonCriticalMeasured: 'DISC_CRITICAL_MEASURED',
    reasonCriticalEstimated: 'DISC_CRITICAL_ESTIMATED',
    condition: input.rearDiscCondition,
    basis: input.rearDiscBasis,
    axle: 'REAR',
    componentKey: 'REAR_DISCS',
  });

  if (
    input.minRemainingKm != null &&
    input.minRemainingKm <= cfg.criticalRemainingKm
  ) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'LOW_REMAINING_KM',
        reasonCode: 'LOW_REMAINING_KM',
        displayMode: 'ESTIMATED',
        value: input.minRemainingKm,
      }),
    );
  } else if (
    input.minRemainingKm != null &&
    input.minRemainingKm <= cfg.lowRemainingKm
  ) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'LOW_REMAINING_KM',
        reasonCode: 'LOW_REMAINING_KM',
        displayMode: 'ESTIMATED',
        value: input.minRemainingKm,
      }),
    );
  }

  if (input.fluidCondition === 'CRITICAL') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'BRAKE_FLUID',
        reasonCode: 'BRAKE_FLUID_CRITICAL',
        displayMode: 'SAFETY_EVIDENCE',
      }),
    );
  } else if (input.fluidCondition === 'WARNING') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'BRAKE_FLUID',
        reasonCode: 'BRAKE_FLUID_WARNING',
        displayMode: 'SAFETY_EVIDENCE',
      }),
    );
  }

  if (input.dtcCondition !== 'UNKNOWN' && input.dtcCondition !== 'GOOD') {
    const isAbs = (input.dtcCategory ?? '').toUpperCase() === 'ABS';
    const critical = input.dtcCondition === 'CRITICAL';
    alerts.push(
      finalizeCandidate(input, {
        alertType: isAbs ? 'ABS_WARNING' : 'BRAKE_DTC',
        reasonCode: critical
          ? isAbs
            ? 'ABS_DTC_CRITICAL'
            : 'BRAKE_DTC_CRITICAL'
          : isAbs
            ? 'ABS_DTC_ACTIVE'
            : 'BRAKE_DTC_ACTIVE',
        displayMode: 'SAFETY_EVIDENCE',
        code: input.dtcCode ?? null,
      }),
    );
  }

  if (input.immediateReplacement) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'IMMEDIATE_REPLACEMENT',
        reasonCode: 'IMMEDIATE_REPLACEMENT_DOCUMENTED',
        displayMode: 'SAFETY_EVIDENCE',
      }),
    );
  }

  if (input.wearSensorActive) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'WEAR_SENSOR',
        reasonCode: 'WEAR_SENSOR_ACTIVE',
        displayMode: 'SAFETY_EVIDENCE',
      }),
    );
  }

  if (input.specUnconfirmed) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'SPEC_UNCONFIRMED',
        reasonCode: 'SPEC_UNCONFIRMED',
        displayMode: 'DATA_GAP',
      }),
    );
  }

  if (input.coverageGap) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'COVERAGE_GAP',
        reasonCode: 'COVERAGE_GAP',
        displayMode: 'DATA_GAP',
      }),
    );
  }

  if (input.distanceConflict) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'DISTANCE_CONFLICT',
        reasonCode: 'DISTANCE_CONFLICT',
        displayMode: 'DATA_GAP',
      }),
    );
  }

  if (input.overallConfidence === 'LOW' || input.overallConfidence === 'UNKNOWN') {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'MEASUREMENT_REQUIRED',
        reasonCode: 'MEASUREMENT_REQUIRED',
        displayMode: 'DATA_GAP',
      }),
    );
  }

  if (input.staleEvidence) {
    alerts.push(
      finalizeCandidate(input, {
        alertType: 'STALE_EVIDENCE',
        reasonCode: 'STALE_EVIDENCE',
        displayMode: 'DATA_GAP',
      }),
    );
  }

  const byKey = new Map<string, StructuredBrakeAlertCandidate>();
  for (const alert of alerts) {
    const existing = byKey.get(alert.dedupeKey);
    if (!existing || existing.severity !== 'critical') {
      byKey.set(alert.dedupeKey, alert);
    }
  }
  return Array.from(byKey.values());
}

export function candidatesToCanonicalAlerts(
  candidates: StructuredBrakeAlertCandidate[],
) {
  return candidates.map((candidate) => ({
    code: candidate.code,
    alertType: candidate.alertType,
    category: candidate.category,
    reasonCode: candidate.reasonCode,
    severity: candidate.severity,
    message: String(candidate.templateParams.messageDe),
    messageEn: String(candidate.templateParams.messageEn),
    axle: candidate.axle ?? undefined,
    displayMode: candidate.displayMode,
    dedupeKey: candidate.dedupeKey,
    evidenceFingerprint: candidate.evidenceFingerprint,
  }));
}

export function hasWearOrSafetyAlert(
  alerts: Array<{ category: string; severity: string }>,
): boolean {
  return alerts.some(
    (alert) =>
      (alert.category === 'WEAR' || alert.category === 'SAFETY') &&
      (alert.severity === 'warning' || alert.severity === 'critical'),
  );
}
