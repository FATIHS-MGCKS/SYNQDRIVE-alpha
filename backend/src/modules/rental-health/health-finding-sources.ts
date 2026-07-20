import {
  buildBatteryReadinessInputFromSummary,
  evaluateBatteryReadiness,
  hasActiveBatterySafetyDtc,
  isBatterySafetyDtcFault,
  type BatteryReadinessEvaluation,
} from '../vehicle-intelligence/battery-health/battery-readiness.policy';
import type { CanonicalBatteryHealthSummary } from '../vehicle-intelligence/battery-health/canonical-battery/canonical-battery-read.adapter';
import type { ServiceComplianceEvaluation } from '../vehicle-intelligence/service-compliance/service-compliance.types';
import {
  NEXT_SERVICE_WARNING_DAYS,
  NEXT_SERVICE_WARNING_KM,
  TUV_BOKRAFT_WARNING_DAYS,
} from '../vehicle-intelligence/service-compliance/service-compliance.config';
import type { DashboardWarningLight } from '../vehicle-intelligence/dashboard-warning-lights/dashboard-warning-lights.types';
import { buildHealthFindingIdentity } from './health-finding-identity';
import type {
  HealthFindingIdentity,
  HealthFindingModule,
  HealthFindingSourceEntityType,
} from './health-finding-identity.types';
import type { HealthState, ModuleHealth } from './rental-health.types';
import type { BrakeRentalHealthModuleHealth } from './brake-rental-health.types';
import type { TireRentalHealthModuleHealth } from './tire-rental-health.types';

export type RentalHealthSourceFindingSeverity =
  | 'critical'
  | 'warning'
  | 'info'
  | 'unknown';

/** API-facing stable finding identity attached to each rental-health module. */
export interface RentalHealthSourceFinding {
  finding_code: string;
  source_entity_type: HealthFindingSourceEntityType;
  source_entity_id: string;
  source_finding_id: string;
  finding_occurrence_id: string;
  occurrence_generation: number;
  version: HealthFindingIdentity['version'];
  first_observed_at: string;
  current_observed_at: string;
  severity: RentalHealthSourceFindingSeverity;
  reason?: string;
}

export interface RentalHealthFindingScope {
  organizationId: string;
  vehicleId: string;
}

type IdentitySeed = {
  healthModule: HealthFindingModule;
  findingCode: string;
  sourceEntityType: HealthFindingSourceEntityType;
  sourceEntityId: string;
  firstObservedAt: string;
  currentObservedAt: string;
  occurrenceGeneration?: number;
  reason?: string;
  severity?: RentalHealthSourceFindingSeverity;
};

const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

function moduleTimestamps(module: Pick<ModuleHealth, 'last_updated_at'>): {
  firstObservedAt: string;
  currentObservedAt: string;
} {
  const ts = module.last_updated_at ?? EPOCH_ISO;
  return { firstObservedAt: ts, currentObservedAt: ts };
}

function healthStateToSeverity(state: HealthState): RentalHealthSourceFindingSeverity {
  switch (state) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'unknown':
      return 'unknown';
    default:
      return 'info';
  }
}

function toApiFinding(scope: RentalHealthFindingScope, seed: IdentitySeed): RentalHealthSourceFinding {
  const identity = buildHealthFindingIdentity({
    organizationId: scope.organizationId,
    vehicleId: scope.vehicleId,
    healthModule: seed.healthModule,
    findingCode: seed.findingCode,
    sourceEntityType: seed.sourceEntityType,
    sourceEntityId: seed.sourceEntityId,
    firstObservedAt: seed.firstObservedAt,
    currentObservedAt: seed.currentObservedAt,
    occurrenceGeneration: seed.occurrenceGeneration,
  });

  return {
    finding_code: identity.findingCode,
    source_entity_type: identity.sourceEntityType,
    source_entity_id: identity.sourceEntityId,
    source_finding_id: identity.sourceFindingId,
    finding_occurrence_id: identity.findingOccurrenceId,
    occurrence_generation: identity.occurrenceGeneration,
    version: identity.version,
    first_observed_at: identity.firstObservedAt,
    current_observed_at: identity.currentObservedAt,
    severity: seed.severity ?? 'unknown',
    ...(seed.reason ? { reason: seed.reason } : {}),
  };
}

function pushUnique(findings: RentalHealthSourceFinding[], finding: RentalHealthSourceFinding): void {
  if (!findings.some((f) => f.source_finding_id === finding.source_finding_id)) {
    findings.push(finding);
  }
}

function moduleAggregateFinding(
  scope: RentalHealthFindingScope,
  healthModule: HealthFindingModule,
  module: ModuleHealth,
): RentalHealthSourceFinding | null {
  if (module.state === 'good' || module.state === 'n_a') return null;
  const ts = moduleTimestamps(module);
  return toApiFinding(scope, {
    healthModule,
    findingCode: `MODULE_STATE_${module.state.toUpperCase()}`,
    sourceEntityType: 'rental_health_module',
    sourceEntityId: healthModule,
    ...ts,
    severity: healthStateToSeverity(module.state),
    reason: module.reason,
  });
}

function finalizeModuleFindings(
  scope: RentalHealthFindingScope,
  healthModule: HealthFindingModule,
  module: ModuleHealth,
  structured: RentalHealthSourceFinding[],
): RentalHealthSourceFinding[] {
  if (module.state === 'good' || module.state === 'n_a') return [];
  if (structured.length > 0) return structured;
  const aggregate = moduleAggregateFinding(scope, healthModule, module);
  return aggregate ? [aggregate] : [];
}

export function buildBatterySourceFindings(
  scope: RentalHealthFindingScope,
  module: ModuleHealth,
  input: {
    summary: CanonicalBatteryHealthSummary | null;
    warningLightActive: boolean;
    readiness: BatteryReadinessEvaluation;
    activeFaultPreview: Array<{
      code?: string | null;
      description?: string | null;
      severity?: string | null;
    }> | null;
  },
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];
  const ts = moduleTimestamps(module);
  const observedAt =
    input.summary?.lv?.freshness?.observedAt ??
    input.summary?.generatedAt ??
    module.last_updated_at ??
    EPOCH_ISO;

  const lvStatus = input.summary?.lv?.healthStatus;
  if (lvStatus === 'CRITICAL' || lvStatus === 'WARNING') {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'battery',
        findingCode: `LV_AGGREGATE_${lvStatus}`,
        sourceEntityType: 'battery_signal',
        sourceEntityId: 'lv_aggregate',
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: lvStatus === 'CRITICAL' ? 'critical' : 'warning',
        reason: module.reason,
      }),
    );
  }

  if (input.warningLightActive) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'battery',
        findingCode: 'BATTERY_WARNING_LIGHT',
        sourceEntityType: 'battery_signal',
        sourceEntityId: 'battery_warning_light',
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: 'warning',
      }),
    );
  }

  for (const fault of input.activeFaultPreview ?? []) {
    if (!isBatterySafetyDtcFault(fault)) continue;
    const code = (fault.code ?? 'unknown').trim();
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'battery',
        findingCode: `DTC_${code.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`,
        sourceEntityType: 'dtc_code',
        sourceEntityId: code.toLowerCase(),
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: 'critical',
      }),
    );
  }

  const readinessCode = deriveBatteryReadinessFindingCode(input.readiness);
  if (readinessCode) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'battery',
        findingCode: readinessCode.findingCode,
        sourceEntityType: 'battery_signal',
        sourceEntityId: readinessCode.sourceEntityId,
        ...ts,
        severity: readinessCode.severity,
        reason: input.readiness.reason ?? module.reason,
      }),
    );
  }

  return finalizeModuleFindings(scope, 'battery', module, findings);
}

function deriveBatteryReadinessFindingCode(readiness: BatteryReadinessEvaluation): {
  findingCode: string;
  sourceEntityId: string;
  severity: RentalHealthSourceFindingSeverity;
} | null {
  if (readiness.effect === 'READY') return null;

  const policyToken = readiness.policyVersion.replace(/[^a-z0-9._-]/gi, '_').toLowerCase();

  switch (readiness.effect) {
    case 'HARD_BLOCK':
      return {
        findingCode: 'BATTERY_READINESS_HARD_BLOCK',
        sourceEntityId: `workshop_defect:${policyToken}`,
        severity: 'critical',
      };
    case 'NOT_READY':
      return {
        findingCode: 'BATTERY_READINESS_NOT_READY',
        sourceEntityId: policyToken,
        severity: 'critical',
      };
    case 'DIAGNOSTIC':
      return {
        findingCode: 'BATTERY_READINESS_DIAGNOSTIC',
        sourceEntityId: policyToken,
        severity: 'warning',
      };
    case 'HINT':
      return {
        findingCode: 'BATTERY_READINESS_HINT',
        sourceEntityId: policyToken,
        severity: 'info',
      };
    case 'UNKNOWN':
      return {
        findingCode: 'BATTERY_READINESS_UNKNOWN',
        sourceEntityId: policyToken,
        severity: 'unknown',
      };
    default:
      return null;
  }
}

export function buildTireSourceFindings(
  scope: RentalHealthFindingScope,
  module: TireRentalHealthModuleHealth,
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];
  const readModel = module.tire_read_model;
  const ts = moduleTimestamps(module);
  const observedAt = readModel?.lastUpdatedAt ?? module.last_updated_at ?? EPOCH_ISO;

  for (const reasonCode of readModel?.structuredReasonCodes ?? []) {
    if (reasonCode === 'REVIEW_OVERRIDE_ACTIVE') continue;
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'tires',
        findingCode: reasonCode,
        sourceEntityType: 'rental_reason_code',
        sourceEntityId: reasonCode.toLowerCase(),
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: healthStateToSeverity(module.state),
        reason: readModel?.primaryReason ?? module.reason,
      }),
    );
  }

  return finalizeModuleFindings(scope, 'tires', module, findings);
}

export function buildBrakeSourceFindings(
  scope: RentalHealthFindingScope,
  module: BrakeRentalHealthModuleHealth,
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];
  const readModel = module.brake_read_model;
  const observedAt = readModel?.lastUpdatedAt ?? module.last_updated_at ?? EPOCH_ISO;

  for (const reasonCode of readModel?.structuredReasonCodes ?? []) {
    if (reasonCode === 'REVIEW_OVERRIDE_ACTIVE') continue;
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'brakes',
        findingCode: reasonCode,
        sourceEntityType: 'rental_reason_code',
        sourceEntityId: reasonCode.toLowerCase(),
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: healthStateToSeverity(module.state),
        reason: readModel?.primaryReason ?? module.reason,
      }),
    );
  }

  for (const alert of readModel?.activeSafetyEvidence ?? []) {
    const alertKey = (alert.reasonCode || alert.alertType || 'unknown')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'brakes',
        findingCode: alert.reasonCode || alert.alertType || 'BRAKE_SAFETY_ALERT',
        sourceEntityType: 'brake_alert',
        sourceEntityId: alertKey,
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: alert.severity === 'critical' ? 'critical' : 'warning',
        reason: alert.message,
      }),
    );
  }

  return finalizeModuleFindings(scope, 'brakes', module, findings);
}

export function buildDtcSourceFindings(
  scope: RentalHealthFindingScope,
  module: ModuleHealth,
  dtcSummary: {
    status: string;
    activeFaultPreview?: Array<{
      code: string;
      severityBand?: string;
      severityRaw?: string | null;
    }>;
    lastSuccessfulCheckAt?: string | null;
    lastCheckedAt?: string | null;
  } | null,
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];
  const lastAt =
    dtcSummary?.lastSuccessfulCheckAt ??
    dtcSummary?.lastCheckedAt ??
    module.last_updated_at ??
    EPOCH_ISO;

  if (dtcSummary?.status === 'active_faults') {
    for (const fault of dtcSummary.activeFaultPreview ?? []) {
      const code = fault.code.trim();
      const band = (fault.severityBand ?? '').toLowerCase();
      const severity: RentalHealthSourceFindingSeverity =
        band === 'safety_critical' || band === 'high' ? 'critical' : 'warning';

      pushUnique(
        findings,
        toApiFinding(scope, {
          healthModule: 'error_codes',
          findingCode: `DTC_${code.replace(/[^A-Za-z0-9]/g, '_').toUpperCase()}`,
          sourceEntityType: 'dtc_code',
          sourceEntityId: code.toLowerCase(),
          firstObservedAt: lastAt,
          currentObservedAt: lastAt,
          severity,
        }),
      );
    }
  }

  return finalizeModuleFindings(scope, 'error_codes', module, findings);
}

export function buildComplianceSourceFindings(
  scope: RentalHealthFindingScope,
  module: ModuleHealth,
  evaluation: ServiceComplianceEvaluation | null,
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];
  const ts = moduleTimestamps(module);
  if (!evaluation) {
    return finalizeModuleFindings(scope, 'service_compliance', module, findings);
  }

  const { nextService, tuvBokraft } = evaluation;

  if (tuvBokraft.tuvOverdue) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'service_compliance',
        findingCode: 'TUV_OVERDUE',
        sourceEntityType: 'compliance_signal',
        sourceEntityId: 'tuv',
        ...ts,
        severity: 'critical',
      }),
    );
  } else if (
    tuvBokraft.tuvValidTill != null &&
    tuvBokraft.tuvRemainingDays != null &&
    !tuvBokraft.tuvOverdue &&
    tuvBokraft.tuvRemainingDays >= 0 &&
    tuvBokraft.tuvRemainingDays <= TUV_BOKRAFT_WARNING_DAYS
  ) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'service_compliance',
        findingCode: 'TUV_DUE_SOON',
        sourceEntityType: 'compliance_signal',
        sourceEntityId: 'tuv',
        ...ts,
        severity: 'warning',
      }),
    );
  }

  if (tuvBokraft.bokraftOverdue) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'service_compliance',
        findingCode: 'BOKRAFT_OVERDUE',
        sourceEntityType: 'compliance_signal',
        sourceEntityId: 'bokraft',
        ...ts,
        severity: 'critical',
      }),
    );
  } else if (
    tuvBokraft.bokraftValidTill != null &&
    tuvBokraft.bokraftRemainingDays != null &&
    !tuvBokraft.bokraftOverdue &&
    tuvBokraft.bokraftRemainingDays >= 0 &&
    tuvBokraft.bokraftRemainingDays <= TUV_BOKRAFT_WARNING_DAYS
  ) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'service_compliance',
        findingCode: 'BOKRAFT_DUE_SOON',
        sourceEntityType: 'compliance_signal',
        sourceEntityId: 'bokraft',
        ...ts,
        severity: 'warning',
      }),
    );
  }

  if (nextService.trackingStatus === 'TRACKED') {
    const overdue = nextService.severity === 'CRITICAL';
    const dueSoon =
      nextService.severity === 'WARNING' &&
      !overdue &&
      ((nextService.timeToNextServiceDays != null &&
        nextService.timeToNextServiceDays >= 0 &&
        nextService.timeToNextServiceDays <= NEXT_SERVICE_WARNING_DAYS) ||
        (nextService.distanceToNextServiceKm != null &&
          nextService.distanceToNextServiceKm >= 0 &&
          nextService.distanceToNextServiceKm <= NEXT_SERVICE_WARNING_KM));

    if (overdue) {
      pushUnique(
        findings,
        toApiFinding(scope, {
          healthModule: 'service_compliance',
          findingCode: 'NEXT_SERVICE_OVERDUE',
          sourceEntityType: 'compliance_signal',
          sourceEntityId: 'next_service',
          firstObservedAt: nextService.lastUpdatedAt ?? ts.firstObservedAt,
          currentObservedAt: nextService.lastUpdatedAt ?? ts.currentObservedAt,
          severity: 'critical',
        }),
      );
    } else if (dueSoon) {
      pushUnique(
        findings,
        toApiFinding(scope, {
          healthModule: 'service_compliance',
          findingCode: 'NEXT_SERVICE_DUE_SOON',
          sourceEntityType: 'compliance_signal',
          sourceEntityId: 'next_service',
          firstObservedAt: nextService.lastUpdatedAt ?? ts.firstObservedAt,
          currentObservedAt: nextService.lastUpdatedAt ?? ts.currentObservedAt,
          severity: 'warning',
        }),
      );
    }
  }

  if (nextService.trackingStatus === 'STALE' && module.state !== 'good') {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'service_compliance',
        findingCode: 'NEXT_SERVICE_STALE',
        sourceEntityType: 'compliance_signal',
        sourceEntityId: 'next_service',
        firstObservedAt: nextService.lastUpdatedAt ?? ts.firstObservedAt,
        currentObservedAt: nextService.lastUpdatedAt ?? ts.currentObservedAt,
        severity: 'unknown',
      }),
    );
  }

  return finalizeModuleFindings(scope, 'service_compliance', module, findings);
}

export function buildComplaintSourceFindings(
  scope: RentalHealthFindingScope,
  module: ModuleHealth,
  complaints: Array<{
    id: string;
    urgency: string;
    blocksRental?: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>,
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];

  for (const complaint of complaints) {
    const severity: RentalHealthSourceFindingSeverity =
      complaint.urgency === 'CRITICAL' || complaint.blocksRental
        ? 'critical'
        : 'warning';

    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'complaints',
        findingCode: complaint.blocksRental
          ? 'COMPLAINT_BLOCKS_RENTAL'
          : `COMPLAINT_${complaint.urgency}`,
        sourceEntityType: 'complaint',
        sourceEntityId: complaint.id,
        firstObservedAt: complaint.createdAt.toISOString(),
        currentObservedAt: complaint.updatedAt.toISOString(),
        severity,
      }),
    );
  }

  return finalizeModuleFindings(scope, 'complaints', module, findings);
}

export function buildVehicleAlertSourceFindings(
  scope: RentalHealthFindingScope,
  module: ModuleHealth,
  hmAi: {
    limpModeActive: boolean | null;
    oilLevel: { status: string | null } | null;
    lastUpdatedAt: string | null;
  } | null,
): RentalHealthSourceFinding[] {
  const findings: RentalHealthSourceFinding[] = [];
  const observedAt = hmAi?.lastUpdatedAt ?? module.last_updated_at ?? EPOCH_ISO;

  if (hmAi?.limpModeActive === true) {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'vehicle_alerts',
        findingCode: 'LIMP_MODE_ACTIVE',
        sourceEntityType: 'vehicle_alert',
        sourceEntityId: 'limp_mode',
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: 'critical',
        reason: module.reason,
      }),
    );
  }

  const oilStatus = (hmAi?.oilLevel?.status ?? '').toUpperCase();
  if (oilStatus === 'LOW' || oilStatus === 'MINIMUM') {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'vehicle_alerts',
        findingCode: 'OIL_LEVEL_MINIMUM',
        sourceEntityType: 'vehicle_alert',
        sourceEntityId: 'oil_level_minimum',
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: 'critical',
      }),
    );
  } else if (oilStatus === 'HIGH' || oilStatus === 'MAXIMUM') {
    pushUnique(
      findings,
      toApiFinding(scope, {
        healthModule: 'vehicle_alerts',
        findingCode: 'OIL_LEVEL_MAXIMUM',
        sourceEntityType: 'vehicle_alert',
        sourceEntityId: 'oil_level_maximum',
        firstObservedAt: observedAt,
        currentObservedAt: observedAt,
        severity: 'warning',
      }),
    );
  }

  return finalizeModuleFindings(scope, 'vehicle_alerts', module, findings);
}

export function buildOemDashboardLightSourceFinding(
  scope: RentalHealthFindingScope,
  light: Pick<
    DashboardWarningLight,
    'key' | 'severity' | 'observedAt' | 'sourceTimestamp' | 'reason'
  >,
): RentalHealthSourceFinding {
  const observedAt =
    light.observedAt ?? light.sourceTimestamp ?? new Date().toISOString();
  const severity: RentalHealthSourceFindingSeverity =
    light.severity === 'critical'
      ? 'critical'
      : light.severity === 'warning'
        ? 'warning'
        : light.severity === 'info'
          ? 'info'
          : 'unknown';

  return toApiFinding(scope, {
    healthModule: 'vehicle_alerts',
    findingCode: `OEM_LIGHT_${light.key.replace(/[\s-]+/g, '_').toUpperCase()}`,
    sourceEntityType: 'oem_dashboard_light',
    sourceEntityId: light.key.toLowerCase(),
    firstObservedAt: observedAt,
    currentObservedAt: observedAt,
    severity,
    reason: light.reason,
  });
}

/** Convenience for battery module evaluation — derives readiness from raw inputs. */
export function buildBatterySourceFindingsFromInputs(
  scope: RentalHealthFindingScope,
  module: ModuleHealth,
  summary: CanonicalBatteryHealthSummary | null,
  warningLightActive: boolean,
  activeFaultPreview: Array<{
    code?: string | null;
    description?: string | null;
    severity?: string | null;
  }> | null,
): RentalHealthSourceFinding[] {
  const readiness = evaluateBatteryReadiness(
    buildBatteryReadinessInputFromSummary({
      summary,
      warningLightActive,
      batterySafetyDtcActive: hasActiveBatterySafetyDtc(activeFaultPreview),
    }),
  );

  return buildBatterySourceFindings(scope, module, {
    summary,
    warningLightActive,
    readiness,
    activeFaultPreview,
  });
}
