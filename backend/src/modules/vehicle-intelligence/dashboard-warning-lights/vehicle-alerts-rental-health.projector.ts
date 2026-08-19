import type { HealthState, ModuleHealth } from '../../rental-health/rental-health.types';
import { isStale, maxSeverity } from '../../rental-health/rental-health.types';
import type {
  DashboardWarningLight,
  DashboardWarningLightsResponse,
} from './dashboard-warning-lights.types';

/** Scoped telltales owned by Rental Health `vehicle_alerts` (P2.2A). */
export const VEHICLE_ALERTS_RENTAL_TELLTALE_KEYS = [
  'engine_limp_mode',
  'engine_oil_level',
] as const;

export type VehicleAlertsRentalTelltaleKey =
  (typeof VEHICLE_ALERTS_RENTAL_TELLTALE_KEYS)[number];

/** Structured blocking cause — never reconstructed from reason strings. */
export interface VehicleAlertBlockingCause {
  telltaleKey: VehicleAlertsRentalTelltaleKey;
  reason: string;
  hardBlock: boolean;
}

export interface VehicleAlertsRentalHealthProjection {
  moduleHealth: ModuleHealth;
  blockingCauses: VehicleAlertBlockingCause[];
}

interface TelltaleAssessment {
  severity: HealthState | null;
  confirmedHealthy: boolean;
  unevaluable: boolean;
  reason: string;
}

const LIMP_BLOCK_REASON = 'Limp Mode aktiv';
const OIL_LOW_BLOCK_REASON = 'Motoröl Minimum';

/**
 * Projects canonical Dashboard Warning Lights (limp + oil only) into Rental Health
 * `vehicle_alerts` module health and structured blocking causes.
 *
 * Does not interpret raw HM signals — consumes enriched telltale read model only.
 */
/**
 * Canonical Rental Health pipeline-failure detection for Dashboard Warning Lights.
 *
 * `not_connected` is intentionally excluded — missing HM/OEM link is `n_a`, not unavailable.
 */
export function isVehicleAlertsDashboardPipelineFailed(
  dashboardLightsRes: PromiseSettledResult<DashboardWarningLightsResponse>,
): boolean {
  if (dashboardLightsRes.status === 'rejected') return true;
  const envelope = dashboardLightsRes.value;
  return envelope.connectionStatus === 'provider_error' || envelope.freshness === 'error';
}

export function projectVehicleAlertsToRentalHealth(
  envelope: DashboardWarningLightsResponse | null,
  opts?: { loadFailed?: boolean },
): VehicleAlertsRentalHealthProjection {
  if (opts?.loadFailed) {
    return {
      moduleHealth: pipelineFailureModule('OEM-Warnleuchten konnten nicht geladen werden'),
      blockingCauses: [],
    };
  }

  if (!envelope) {
    return {
      moduleHealth: pipelineFailureModule('OEM-Warnleuchten nicht verfügbar'),
      blockingCauses: [],
    };
  }

  if (
    envelope.connectionStatus === 'not_connected' &&
    envelope.supportStatus === 'not_connected'
  ) {
    return {
      moduleHealth: {
        state: 'n_a',
        reason: 'Keine OEM-Warnleuchten-Quelle aktiv',
        last_updated_at: envelope.lastObservedAt,
        data_stale: isEnvelopeDataStale(envelope),
        source: 'dashboard_warning_lights',
        evidence_type: 'unknown',
      },
      blockingCauses: [],
    };
  }

  if (envelope.connectionStatus === 'provider_error' || envelope.freshness === 'error') {
    return {
      moduleHealth: {
        state: 'unknown',
        reason: envelope.message || 'OEM-Warnleuchten-Providerfehler',
        last_updated_at: envelope.lastObservedAt,
        data_stale: true,
        source: 'dashboard_warning_lights',
        evidence_type: 'provider',
      },
      blockingCauses: [],
    };
  }

  const limp = findScopedLight(envelope, 'engine_limp_mode');
  const oil = findScopedLight(envelope, 'engine_oil_level');
  const limpAssess = assessTelltale(limp);
  const oilAssess = assessTelltale(oil);
  const blockingCauses = collectVehicleAlertBlockingCauses(limp, oil);
  const moduleHealth = aggregateVehicleAlertsModuleHealth(
    envelope,
    limp,
    oil,
    limpAssess,
    oilAssess,
    blockingCauses,
  );

  return { moduleHealth, blockingCauses };
}

function pipelineFailureModule(reason: string): ModuleHealth {
  return {
    state: 'unknown',
    reason,
    last_updated_at: null,
    data_stale: true,
    source: 'dashboard_warning_lights',
    evidence_type: 'unknown',
  };
}

function findScopedLight(
  envelope: DashboardWarningLightsResponse,
  key: VehicleAlertsRentalTelltaleKey,
): DashboardWarningLight | undefined {
  return envelope.lights.find((l) => l.key === key);
}

function assessTelltale(light: DashboardWarningLight | undefined): TelltaleAssessment {
  if (!light) {
    return {
      severity: null,
      confirmedHealthy: false,
      unevaluable: true,
      reason: 'Telltale nicht im Read-Model',
    };
  }

  if (light.isCurrentActive === true) {
    if (light.severity === 'critical') {
      return {
        severity: 'critical',
        confirmedHealthy: false,
        unevaluable: false,
        reason: light.reason,
      };
    }
    if (light.severity === 'warning') {
      return {
        severity: 'warning',
        confirmedHealthy: false,
        unevaluable: false,
        reason: light.reason,
      };
    }
    return {
      severity: 'warning',
      confirmedHealthy: false,
      unevaluable: false,
      reason: light.reason,
    };
  }

  if (light.state === 'off_confirmed') {
    return {
      severity: 'good',
      confirmedHealthy: true,
      unevaluable: false,
      reason: light.reason,
    };
  }

  if (light.isHistorical === true) {
    return {
      severity: 'unknown',
      confirmedHealthy: false,
      unevaluable: true,
      reason: 'Zuvor aktive Warnung — kein bestätigtes Aus seit Staleness',
    };
  }

  if (light.state === 'stale') {
    return {
      severity: 'unknown',
      confirmedHealthy: false,
      unevaluable: true,
      reason: light.reason,
    };
  }

  if (light.state === 'active') {
    return {
      severity: 'unknown',
      confirmedHealthy: false,
      unevaluable: true,
      reason: light.reason,
    };
  }

  if (light.state === 'no_event_yet' || light.state === 'unsupported') {
    return {
      severity: null,
      confirmedHealthy: false,
      unevaluable: true,
      reason: light.reason,
    };
  }

  return {
    severity: null,
    confirmedHealthy: false,
    unevaluable: true,
    reason: light.reason,
  };
}

function collectVehicleAlertBlockingCauses(
  limp: DashboardWarningLight | undefined,
  oil: DashboardWarningLight | undefined,
): VehicleAlertBlockingCause[] {
  const causes: VehicleAlertBlockingCause[] = [];

  if (limp?.isCurrentActive === true && limp.rentalImpact === 'block_rental') {
    causes.push({
      telltaleKey: 'engine_limp_mode',
      reason: LIMP_BLOCK_REASON,
      hardBlock: true,
    });
  }

  if (oil?.isCurrentActive === true && oil.rentalImpact === 'block_rental') {
    causes.push({
      telltaleKey: 'engine_oil_level',
      reason: OIL_LOW_BLOCK_REASON,
      hardBlock: true,
    });
  }

  return causes;
}

function aggregateVehicleAlertsModuleHealth(
  envelope: DashboardWarningLightsResponse,
  limp: DashboardWarningLight | undefined,
  oil: DashboardWarningLight | undefined,
  limpAssess: TelltaleAssessment,
  oilAssess: TelltaleAssessment,
  blockingCauses: VehicleAlertBlockingCause[],
): ModuleHealth {
  const lastUpdated = latestObservedAt(envelope, limp, oil);
  const dataStale = isEnvelopeDataStale(envelope, lastUpdated);
  const base: Pick<ModuleHealth, 'last_updated_at' | 'data_stale' | 'source' | 'evidence_type'> =
    {
      last_updated_at: lastUpdated,
      data_stale: dataStale,
      source: 'dashboard_warning_lights',
      evidence_type: 'provider',
    };

  if (blockingCauses.some((c) => c.hardBlock)) {
    const primary =
      blockingCauses.find((c) => c.telltaleKey === 'engine_limp_mode') ??
      blockingCauses.find((c) => c.hardBlock);
    return {
      ...base,
      state: 'critical',
      reason: primary?.reason ?? 'OEM-Warnleuchten kritisch',
    };
  }

  const combinedSeverity = combineAssessments(limpAssess, oilAssess);
  if (combinedSeverity === 'critical') {
    return {
      ...base,
      state: 'critical',
      reason: pickPrimaryReason(limpAssess, oilAssess, 'critical'),
    };
  }
  if (combinedSeverity === 'warning') {
    return {
      ...base,
      state: 'warning',
      reason:
        oilAssess.severity === 'warning'
          ? 'Motoröl über Maximum'
          : pickPrimaryReason(limpAssess, oilAssess, 'warning'),
    };
  }

  const scoped = [limp, oil].filter(
    (l): l is DashboardWarningLight => l != null && l.state !== 'unsupported',
  );

  if (scoped.length === 0) {
    return {
      ...base,
      state: 'n_a',
      reason: 'Keine verwertbaren Limp-/Öl-Telltales für dieses Fahrzeug',
    };
  }

  const allConfirmedHealthy = scoped.every((l) => l.state === 'off_confirmed');
  if (allConfirmedHealthy) {
    return {
      ...base,
      state: 'good',
      reason: 'Keine OEM-Warnleuchten aktiv',
    };
  }

  const anyUnevaluable =
    limpAssess.unevaluable ||
    oilAssess.unevaluable ||
    scoped.some(
      (l) =>
        l.state === 'no_event_yet' ||
        l.state === 'stale' ||
        l.isHistorical === true,
    );

  if (anyUnevaluable) {
    return {
      ...base,
      state: 'unknown',
      reason: pickUnevaluableReason(limpAssess, oilAssess, limp, oil),
    };
  }

  return {
    ...base,
    state: 'unknown',
    reason: 'OEM-Warnleuchten nicht vollständig bewertbar',
  };
}

function combineAssessments(
  limpAssess: TelltaleAssessment,
  oilAssess: TelltaleAssessment,
): HealthState | null {
  const severities = [limpAssess.severity, oilAssess.severity].filter(
    (s): s is HealthState => s != null && s !== 'good' && s !== 'n_a',
  );
  if (severities.length === 0) return null;
  return severities.reduce((acc, s) => maxSeverity(acc, s));
}

function pickPrimaryReason(
  limpAssess: TelltaleAssessment,
  oilAssess: TelltaleAssessment,
  target: 'critical' | 'warning',
): string {
  if (limpAssess.severity === target) return limpAssess.reason;
  if (oilAssess.severity === target) return oilAssess.reason;
  return target === 'critical' ? 'OEM-Warnleuchten kritisch' : 'OEM-Warnleuchten Warnung';
}

function pickUnevaluableReason(
  limpAssess: TelltaleAssessment,
  oilAssess: TelltaleAssessment,
  limp: DashboardWarningLight | undefined,
  oil: DashboardWarningLight | undefined,
): string {
  if (limpAssess.unevaluable && limpAssess.reason) return limpAssess.reason;
  if (oilAssess.unevaluable && oilAssess.reason) return oilAssess.reason;
  if (limp?.state === 'no_event_yet' || oil?.state === 'no_event_yet') {
    return 'Noch kein verwertbarer OEM-Warnleuchten-Status';
  }
  return 'OEM-Warnleuchten nicht vollständig bewertbar';
}

function latestObservedAt(
  envelope: DashboardWarningLightsResponse,
  limp?: DashboardWarningLight,
  oil?: DashboardWarningLight,
): string | null {
  const candidates = [limp?.observedAt, oil?.observedAt, envelope.lastObservedAt].filter(
    Boolean,
  ) as string[];
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, ts) =>
    new Date(ts).getTime() > new Date(latest).getTime() ? ts : latest,
  );
}

function isEnvelopeDataStale(
  envelope: DashboardWarningLightsResponse,
  lastUpdated?: string | null,
): boolean {
  if (envelope.freshness === 'stale' || envelope.freshness === 'error') return true;
  return isStale(lastUpdated ?? envelope.lastObservedAt);
}

/** Maps structured blocking causes to Rental Health `blocking_reasons` strings. */
export function vehicleAlertBlockingCausesToReasons(
  causes: VehicleAlertBlockingCause[],
): string[] {
  return causes.filter((c) => c.hardBlock).map((c) => c.reason);
}

/** Test helper — build a minimal envelope with scoped telltales only. */
export function buildVehicleAlertsTestEnvelope(
  lights: DashboardWarningLight[],
  overrides: Partial<DashboardWarningLightsResponse> = {},
): DashboardWarningLightsResponse {
  return {
    vehicleId: 'test-veh',
    provider: 'HIGH_MOBILITY',
    connectionStatus: 'connected',
    supportStatus: 'supported',
    freshness: 'fresh',
    overallStatus: 'unknown',
    lastObservedAt: new Date().toISOString(),
    message: 'test',
    rentalHealthReady: true,
    lights,
    ...overrides,
  };
}
