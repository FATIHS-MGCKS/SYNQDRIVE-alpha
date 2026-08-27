/**
 * Stage 2A — Shared frontend row projection for fleet / dashboard / vehicle-detail consumers.
 *
 * Preserves separate semantic dimensions (business, availability, readiness, connectivity, health)
 * without collapsing them into a single badge or first-finding-wins chip.
 */
import type {
  DashboardWarningLightsResponse,
  RentalHealthModule,
  VehicleHealthResponse,
} from '../../lib/api';
import type { StatusTone } from '../../components/patterns';
import type { TranslationKey } from '../i18n/translations/en';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { VehicleData } from '../data/vehicles';
import type { FleetProjectionVehicle } from './fleet-vehicle-ui-projection';
import { buildFleetVehicleUiProjection } from './fleet-vehicle-ui-projection';
import { resolveHealthDisplayFromUi } from './fleet-p1-3-display';
import type { VehicleOperationalUiProjection } from './operational-projection';
import type { BusinessOperationalState } from './operational-projection/types';
import {
  HEALTH_EVALUABILITY_STATE,
  type HealthEvaluabilityState,
} from './fleet-health-evaluation/types';
import {
  OPERATIONAL_AVAILABILITY_STATE,
  type OperationalAvailabilityState,
} from './operational-availability/types';
import { isModulePipelineUnavailable } from './rental-health-availability';
import {
  isOperativeRentalHealthModule,
  operativeSeverityFromRentalModule,
} from './operational-issues/operationalIssueTaxonomy';
import {
  selectOperationalStatus,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleOperationalStatus,
} from './vehicle-operational-state';
import { isTelltaleCurrentlyActive } from './dashboard-warning-lights-display';
import { OPERATIONAL_PRIMARY_REASON_LABEL_KEYS } from './operational-projection/ui/primary-reason-presentation';

export const ACTIVE_HEALTH_FINDING_TYPE = {
  TIRE: 'TIRE',
  BRAKE: 'BRAKE',
  BATTERY: 'BATTERY',
  DTC: 'DTC',
  DASHBOARD_WARNING: 'DASHBOARD_WARNING',
  SERVICE: 'SERVICE',
  COMPLIANCE: 'COMPLIANCE',
} as const;

export type ActiveHealthFindingType =
  (typeof ACTIVE_HEALTH_FINDING_TYPE)[keyof typeof ACTIVE_HEALTH_FINDING_TYPE];

export type ActiveHealthFindingSeverity = 'critical' | 'warning';

export type ActiveHealthFindingSource =
  | 'rental_health'
  | 'health_evaluation'
  | 'dashboard_warnings'
  | 'operational_projection';

export interface ActiveHealthFinding {
  type: ActiveHealthFindingType;
  severity: ActiveHealthFindingSeverity;
  reasonCode: string;
  source: ActiveHealthFindingSource;
  localizationKey: TranslationKey;
  count?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface VehicleRowReadinessInput {
  isReadyToRent: boolean;
  blockingReasonCodes?: string[];
}

export interface VehicleRowOperationalProjection {
  vehicleId: string;
  projectionTimestamp: string | null;

  businessState: BusinessOperationalState;

  operationalAvailability: {
    state: OperationalAvailabilityState;
    tone: StatusTone;
    localizationKey: TranslationKey;
  };

  readiness: {
    isReadyToRent: boolean;
    tone: StatusTone;
    localizationKey: TranslationKey;
    blockingReasonCodes: string[];
    /** False when P1.5 runtime readiness was not supplied to the builder. */
    authorityPresent: boolean;
  };

  connectivity: {
    overallState: string | null;
    attentionState: string | null;
    telemetryState: string | null;
    localizationKey: TranslationKey | null;
  };

  healthEvaluability: HealthEvaluabilityState;

  healthCondition: {
    state: 'good' | 'warning' | 'critical' | 'unknown';
    tone: StatusTone;
    localizationKey: TranslationKey;
  };

  attention: {
    state: string | null;
    primaryReasonCode: string | null;
    localizationKey: TranslationKey | null;
  };

  activeHealthFindings: ActiveHealthFinding[];
}

export interface BuildVehicleRowOperationalProjectionInput {
  vehicle: FleetProjectionVehicle | VehicleData;
  uiProjection?: VehicleOperationalUiProjection;
  rentalHealth?: VehicleHealthResponse | null;
  readiness?: VehicleRowReadinessInput | null;
  dashboardWarningLights?: DashboardWarningLightsResponse | null;
  locale?: 'en' | 'de';
}

type RentalHealthModuleKey = keyof VehicleHealthResponse['modules'];

const RENTAL_MODULE_TO_FINDING_TYPE: Partial<Record<RentalHealthModuleKey, ActiveHealthFindingType>> = {
  tires: ACTIVE_HEALTH_FINDING_TYPE.TIRE,
  brakes: ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
  battery: ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
  error_codes: ACTIVE_HEALTH_FINDING_TYPE.DTC,
  service_compliance: ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
};

const FINDING_TYPE_ORDER: ActiveHealthFindingType[] = [
  ACTIVE_HEALTH_FINDING_TYPE.DTC,
  ACTIVE_HEALTH_FINDING_TYPE.SERVICE,
  ACTIVE_HEALTH_FINDING_TYPE.COMPLIANCE,
  ACTIVE_HEALTH_FINDING_TYPE.BRAKE,
  ACTIVE_HEALTH_FINDING_TYPE.TIRE,
  ACTIVE_HEALTH_FINDING_TYPE.BATTERY,
  ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
];

const FINDING_LOCALIZATION_KEYS: Record<
  ActiveHealthFindingType,
  Record<ActiveHealthFindingSeverity, TranslationKey>
> = {
  [ACTIVE_HEALTH_FINDING_TYPE.TIRE]: {
    warning: 'fleet.rowFinding.tire.warning',
    critical: 'fleet.rowFinding.tire.critical',
  },
  [ACTIVE_HEALTH_FINDING_TYPE.BRAKE]: {
    warning: 'fleet.rowFinding.brake.warning',
    critical: 'fleet.rowFinding.brake.critical',
  },
  [ACTIVE_HEALTH_FINDING_TYPE.BATTERY]: {
    warning: 'fleet.rowFinding.battery.warning',
    critical: 'fleet.rowFinding.battery.critical',
  },
  [ACTIVE_HEALTH_FINDING_TYPE.DTC]: {
    warning: 'fleet.rowFinding.dtc.warning',
    critical: 'fleet.rowFinding.dtc.critical',
  },
  [ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING]: {
    warning: 'fleet.rowFinding.dashboardWarning.warning',
    critical: 'fleet.rowFinding.dashboardWarning.critical',
  },
  [ACTIVE_HEALTH_FINDING_TYPE.SERVICE]: {
    warning: 'fleet.rowFinding.service.warning',
    critical: 'fleet.rowFinding.service.critical',
  },
  [ACTIVE_HEALTH_FINDING_TYPE.COMPLIANCE]: {
    warning: 'fleet.rowFinding.compliance.warning',
    critical: 'fleet.rowFinding.compliance.critical',
  },
};

const READINESS_READY_KEY: TranslationKey = 'fleet.rowProjection.readiness.ready';
const READINESS_NOT_READY_KEY: TranslationKey = 'fleet.rowProjection.readiness.notReady';

const RENTAL_MODULE_SCAN_ORDER: RentalHealthModuleKey[] = [
  'error_codes',
  'service_compliance',
  'brakes',
  'tires',
  'battery',
  'vehicle_alerts',
  'complaints',
];

function tForLocale(locale: 'en' | 'de'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

function mapOperationalStatusToBusinessState(
  status: VehicleOperationalStatus,
): BusinessOperationalState {
  switch (status) {
    case VEHICLE_OPERATIONAL_STATUS.AVAILABLE:
      return 'AVAILABLE';
    case VEHICLE_OPERATIONAL_STATUS.RESERVED:
      return 'RESERVED';
    case VEHICLE_OPERATIONAL_STATUS.ACTIVE_RENTED:
      return 'RENTED';
    case VEHICLE_OPERATIONAL_STATUS.MAINTENANCE:
      return 'IN_SERVICE';
    case VEHICLE_OPERATIONAL_STATUS.BLOCKED:
      return 'OUT_OF_SERVICE';
    default:
      return 'UNKNOWN';
  }
}

function extractCount(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = String(text).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function severityRank(severity: ActiveHealthFindingSeverity): number {
  return severity === 'critical' ? 0 : 1;
}

function findingTypeRank(type: ActiveHealthFindingType): number {
  const index = FINDING_TYPE_ORDER.indexOf(type);
  return index === -1 ? FINDING_TYPE_ORDER.length : index;
}

function sortActiveHealthFindings(findings: ActiveHealthFinding[]): ActiveHealthFinding[] {
  return [...findings].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return findingTypeRank(a.type) - findingTypeRank(b.type);
  });
}

function rentalModuleReasonCode(moduleKey: RentalHealthModuleKey, module: RentalHealthModule): string {
  const tireCode = module.tire_read_model?.primaryReasonCode;
  if (moduleKey === 'tires' && tireCode) return tireCode;
  const brakeCode = module.brake_read_model?.structuredReasonCodes?.[0];
  if (moduleKey === 'brakes' && brakeCode) return brakeCode;
  if (module.source) return `rental_health:${moduleKey}:${module.source}`;
  return `rental_health:${moduleKey}:${module.state}`;
}

function buildRentalHealthFindings(
  health: VehicleHealthResponse | null | undefined,
  options: { includeVehicleAlerts: boolean },
): ActiveHealthFinding[] {
  if (!health?.modules) return [];

  const findings: ActiveHealthFinding[] = [];

  for (const moduleKey of RENTAL_MODULE_SCAN_ORDER) {
    if (moduleKey === 'vehicle_alerts' && !options.includeVehicleAlerts) continue;

    const module = health.modules[moduleKey];
    if (!module || isModulePipelineUnavailable(module)) continue;

    const findingType = RENTAL_MODULE_TO_FINDING_TYPE[moduleKey];
    if (!findingType) continue;
    if (!isOperativeRentalHealthModule(moduleKey, module)) continue;

    const severity = operativeSeverityFromRentalModule(moduleKey, module);
    if (severity !== 'critical' && severity !== 'warning') continue;

    const count =
      moduleKey === 'error_codes' ? extractCount(module.reason) ?? undefined : undefined;

    findings.push({
      type: findingType,
      severity,
      reasonCode: rentalModuleReasonCode(moduleKey, module),
      source: 'rental_health',
      localizationKey: FINDING_LOCALIZATION_KEYS[findingType][severity],
      ...(count != null && count > 0 ? { count } : {}),
      metadata: {
        moduleKey,
        dataStale: module.data_stale,
      },
    });
  }

  return findings;
}

function buildDashboardWarningFindings(
  dashboardWarningLights: DashboardWarningLightsResponse | null | undefined,
): ActiveHealthFinding[] {
  if (!dashboardWarningLights?.lights?.length) return [];

  const envelopeFreshness = dashboardWarningLights.freshness;
  const findings: ActiveHealthFinding[] = [];

  for (const light of dashboardWarningLights.lights) {
    if (!isTelltaleCurrentlyActive(light, envelopeFreshness)) continue;
    if (light.severity !== 'critical' && light.severity !== 'warning') continue;

    findings.push({
      type: ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING,
      severity: light.severity,
      reasonCode: `dashboard_warning:${light.key}`,
      source: 'dashboard_warnings',
      localizationKey: FINDING_LOCALIZATION_KEYS[ACTIVE_HEALTH_FINDING_TYPE.DASHBOARD_WARNING][light.severity],
      metadata: {
        telltaleKey: light.key,
        sourceSignal: light.sourceSignal,
      },
    });
  }

  return findings;
}

function dedupeActiveHealthFindings(findings: ActiveHealthFinding[]): ActiveHealthFinding[] {
  const seen = new Set<string>();
  const out: ActiveHealthFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.type}:${finding.reasonCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(finding);
  }

  return out;
}

function resolveProjectionTimestamp(
  vehicle: FleetProjectionVehicle | VehicleData,
): string | null {
  const candidates = [
    vehicle.operationalAvailability?.generatedAt,
    vehicle.healthEvaluation?.generatedAt,
    vehicle.connectivityRuntime?.calculatedAt,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (candidates.length === 0) return null;

  return candidates.sort().at(-1) ?? null;
}

function resolveHealthEvaluability(ui: VehicleOperationalUiProjection): HealthEvaluabilityState {
  return ui.health.presentation?.evaluability ?? HEALTH_EVALUABILITY_STATE.UNKNOWN;
}

function resolveHealthCondition(
  ui: VehicleOperationalUiProjection,
): VehicleRowOperationalProjection['healthCondition'] {
  const healthDisplay = resolveHealthDisplayFromUi(ui);
  const condition = healthDisplay.status;
  const localizationKey: TranslationKey =
    condition === 'good'
      ? 'fleet.healthEvaluation.condition.good'
      : condition === 'warning'
        ? 'fleet.healthEvaluation.condition.warning'
        : condition === 'critical'
          ? 'fleet.healthEvaluation.condition.critical'
          : 'fleet.healthEvaluation.condition.unknown';

  return {
    state: condition,
    tone: healthDisplay.tone,
    localizationKey,
  };
}

function resolveOperationalAvailability(
  ui: VehicleOperationalUiProjection,
): VehicleRowOperationalProjection['operationalAvailability'] {
  const presentation = ui.availability.presentation;
  const state = presentation?.state ?? OPERATIONAL_AVAILABILITY_STATE.UNKNOWN;
  const localizationKey: TranslationKey =
    presentation?.labelKey ?? 'fleet.operationalAvailability.unknown';

  return {
    state,
    tone: presentation?.tone ?? 'neutral',
    localizationKey,
  };
}

function resolveReadiness(
  readiness: VehicleRowReadinessInput | null | undefined,
): VehicleRowOperationalProjection['readiness'] {
  if (!readiness) {
    return {
      isReadyToRent: false,
      tone: 'watch',
      localizationKey: READINESS_NOT_READY_KEY,
      blockingReasonCodes: [],
      authorityPresent: false,
    };
  }

  return {
    isReadyToRent: readiness.isReadyToRent,
    tone: readiness.isReadyToRent ? 'success' : 'watch',
    localizationKey: readiness.isReadyToRent ? READINESS_READY_KEY : READINESS_NOT_READY_KEY,
    blockingReasonCodes: readiness.blockingReasonCodes ?? [],
    authorityPresent: true,
  };
}

function resolveConnectivity(
  ui: VehicleOperationalUiProjection,
): VehicleRowOperationalProjection['connectivity'] {
  const overall = ui.connectivity.overallState.presentation;
  const attention = ui.attention.attention.presentation;
  const telemetry = ui.connectivity.telemetryState.presentation;

  return {
    overallState: overall?.state ?? null,
    attentionState: attention?.state ?? null,
    telemetryState: telemetry?.state ?? null,
    localizationKey: telemetry?.state
      ? (`fleetConnectivity.telemetryFreshness.${telemetry.state}` as TranslationKey)
      : null,
  };
}

function resolveAttention(
  ui: VehicleOperationalUiProjection,
): VehicleRowOperationalProjection['attention'] {
  const primary = ui.operator.primaryReason.presentation ?? ui.attention.primaryReason.presentation;
  const code = primary?.code ?? null;
  return {
    state: ui.attention.attention.presentation?.state ?? null,
    primaryReasonCode: code,
    localizationKey: code ? (OPERATIONAL_PRIMARY_REASON_LABEL_KEYS[code] ?? null) : null,
  };
}

export function buildActiveHealthFindings(input: {
  rentalHealth?: VehicleHealthResponse | null;
  dashboardWarningLights?: DashboardWarningLightsResponse | null;
}): ActiveHealthFinding[] {
  const hasDashboardWarnings = Boolean(input.dashboardWarningLights?.lights?.length);
  const rentalFindings = buildRentalHealthFindings(input.rentalHealth, {
    includeVehicleAlerts: !hasDashboardWarnings,
  });
  const dashboardFindings = buildDashboardWarningFindings(input.dashboardWarningLights);
  return sortActiveHealthFindings(
    dedupeActiveHealthFindings([...rentalFindings, ...dashboardFindings]),
  );
}

export function buildVehicleRowOperationalProjection(
  input: BuildVehicleRowOperationalProjectionInput,
): VehicleRowOperationalProjection {
  const locale = input.locale ?? 'de';
  const uiProjection =
    input.uiProjection ??
    buildFleetVehicleUiProjection(input.vehicle as FleetProjectionVehicle, { locale });

  const businessState = mapOperationalStatusToBusinessState(selectOperationalStatus(input.vehicle));
  const activeHealthFindings = buildActiveHealthFindings({
    rentalHealth: input.rentalHealth,
    dashboardWarningLights: input.dashboardWarningLights,
  });

  // Touch translator only to keep locale wiring explicit for future consumers.
  void tForLocale(locale);

  return {
    vehicleId: input.vehicle.id,
    projectionTimestamp: resolveProjectionTimestamp(input.vehicle),
    businessState,
    operationalAvailability: resolveOperationalAvailability(uiProjection),
    readiness: resolveReadiness(input.readiness),
    connectivity: resolveConnectivity(uiProjection),
    healthEvaluability: resolveHealthEvaluability(uiProjection),
    healthCondition: resolveHealthCondition(uiProjection),
    attention: resolveAttention(uiProjection),
    activeHealthFindings,
  };
}
