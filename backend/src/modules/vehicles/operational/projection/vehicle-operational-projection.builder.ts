/**
 * P0.2 — Pure builder for {@link VehicleOperationalProjection}.
 *
 * Consumes P0.1 {@link VehicleConnectivityRuntimeState} as-is.
 * Does NOT reimplement telemetry thresholds, webhook ordering, or physical evidence.
 */
import {
  AttentionState,
  ConnectivityReasonCode,
  ConnectivityRecommendedAction,
  DataCoverageState,
  OverallConnectivityState,
  PhysicalDeviceState,
  type VehicleConnectivityRuntimeState,
} from '../../connectivity/domain/connectivity-domain.types';
import {
  BusinessOperationalState,
  HealthEvaluabilityState,
  OperationalAvailabilityState,
  OperationalProjectionReasonCode,
  type HealthEvidenceSnapshot,
  type OperationalReasonCode,
  type OperatorAttentionLevel,
  type VehicleOperationalEvidence,
  type VehicleOperationalOperatorSummary,
  type VehicleOperationalProjection,
  VEHICLE_OPERATIONAL_PROJECTION_VERSION,
} from './vehicle-operational-projection.types';

export interface BuildVehicleOperationalProjectionInput {
  vehicleId: string;
  organizationId: string;
  generatedAt: Date | string;
  businessState: BusinessOperationalState;
  connectivity: VehicleConnectivityRuntimeState;
  health?: HealthEvidenceSnapshot | null;
  /**
   * When false, projection preserves epistemic uncertainty from P0.1.
   * When null/undefined, treated as unknown reliability.
   */
  episodeEvidenceReliable?: boolean | null;
}

export interface BuildVehicleOperationalProjectionBatchInput {
  projections: BuildVehicleOperationalProjectionInput[];
  /** Shared request anchor — all vehicles in a fleet response use the same `now`. */
  generatedAt: Date | string;
}

const BUSINESS_HARD_BLOCK_STATES: ReadonlySet<BusinessOperationalState> = new Set([
  BusinessOperationalState.IN_SERVICE,
  BusinessOperationalState.OUT_OF_SERVICE,
]);

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function isBusinessHardBlocked(state: BusinessOperationalState): boolean {
  return BUSINESS_HARD_BLOCK_STATES.has(state);
}

function isConfirmedConnectivityInterruption(
  connectivity: VehicleConnectivityRuntimeState,
): boolean {
  return (
    connectivity.overallState === OverallConnectivityState.DEVICE_UNPLUGGED &&
    connectivity.physicalDeviceState === PhysicalDeviceState.UNPLUGGED_CONFIRMED
  );
}

function connectivityRequiresVerification(
  connectivity: VehicleConnectivityRuntimeState,
): boolean {
  if (connectivity.reasonCodes.includes(ConnectivityReasonCode.DEVICE_CHECK_REQUIRED)) {
    return true;
  }
  if (
    connectivity.telemetryState === 'offline' ||
    connectivity.telemetryState === 'no_signal'
  ) {
    return true;
  }
  if (connectivity.attentionState === AttentionState.ACTION_REQUIRED) {
    return true;
  }
  return false;
}

/**
 * Health-domain evaluability — connectivity-independent base.
 * Fresh connectivity must never upgrade missing health evidence to EVALUABLE.
 */
export function deriveHealthEvaluabilityFromHealthDomain(
  health: HealthEvidenceSnapshot | null | undefined,
): HealthEvaluabilityState {
  if (!health) {
    return HealthEvaluabilityState.UNKNOWN;
  }

  if (health.pipelineAvailability === 'unavailable') {
    return HealthEvaluabilityState.NOT_EVALUABLE;
  }

  if (!health.generatedAt) {
    return HealthEvaluabilityState.UNKNOWN;
  }

  if (health.anyModuleDataStale) {
    return health.pipelineAvailability === 'ready'
      ? HealthEvaluabilityState.PARTIALLY_EVALUABLE
      : HealthEvaluabilityState.NOT_EVALUABLE;
  }

  if (health.pipelineAvailability === 'partial') {
    return HealthEvaluabilityState.PARTIALLY_EVALUABLE;
  }

  if (health.pipelineAvailability === 'ready') {
    return HealthEvaluabilityState.EVALUABLE;
  }

  return HealthEvaluabilityState.UNKNOWN;
}

function downgradeHealthEvaluability(
  current: HealthEvaluabilityState,
  steps: number,
): HealthEvaluabilityState {
  const ladder: HealthEvaluabilityState[] = [
    HealthEvaluabilityState.EVALUABLE,
    HealthEvaluabilityState.PARTIALLY_EVALUABLE,
    HealthEvaluabilityState.NOT_EVALUABLE,
    HealthEvaluabilityState.UNKNOWN,
  ];
  const index = ladder.indexOf(current);
  if (index < 0) return current;
  return ladder[Math.min(index + steps, ladder.length - 1)]!;
}

/**
 * Connectivity may only downgrade health evaluability — never create or upgrade it.
 */
export function applyConnectivityHealthEvaluabilityLimiter(
  base: HealthEvaluabilityState,
  health: HealthEvidenceSnapshot,
  connectivity: VehicleConnectivityRuntimeState,
): HealthEvaluabilityState {
  if (
    base === HealthEvaluabilityState.UNKNOWN ||
    base === HealthEvaluabilityState.NOT_EVALUABLE
  ) {
    return base;
  }

  const telemetrySilent =
    connectivity.telemetryState === 'offline' ||
    connectivity.telemetryState === 'no_signal';
  const coverageGap =
    connectivity.dataCoverageState === DataCoverageState.INSUFFICIENT ||
    connectivity.reasonCodes.includes(ConnectivityReasonCode.DATA_COVERAGE_INSUFFICIENT);

  if (!telemetrySilent && !coverageGap) {
    return base;
  }

  if (health.anyModuleDataStale || coverageGap) {
    return downgradeHealthEvaluability(base, 1);
  }

  if (
    telemetrySilent &&
    health.telemetryDependentModulesEvaluated === true &&
    base === HealthEvaluabilityState.EVALUABLE
  ) {
    return HealthEvaluabilityState.PARTIALLY_EVALUABLE;
  }

  return base;
}

/**
 * Derive health evaluability from health-domain metadata with connectivity as
 * a conservative limiter only.
 */
export function deriveHealthEvaluability(
  health: HealthEvidenceSnapshot | null | undefined,
  connectivity: VehicleConnectivityRuntimeState,
): HealthEvaluabilityState {
  const base = deriveHealthEvaluabilityFromHealthDomain(health);
  if (!health) {
    return base;
  }
  return applyConnectivityHealthEvaluabilityLimiter(base, health, connectivity);
}

/**
 * Precedence (high → low):
 * 1. Business workflow hard-block
 * 2. Health rental hard-block (when pipeline ready)
 * 3. Confirmed current connectivity interruption
 * 4. Connectivity verification required
 * 5. Normal availability
 */
export function deriveOperationalAvailability(
  businessState: BusinessOperationalState,
  connectivity: VehicleConnectivityRuntimeState,
  health: HealthEvidenceSnapshot | null | undefined,
): OperationalAvailabilityState {
  if (isBusinessHardBlocked(businessState)) {
    return OperationalAvailabilityState.UNAVAILABLE;
  }

  if (
    health?.pipelineAvailability === 'ready' &&
    health.rentalBlocked === true
  ) {
    return OperationalAvailabilityState.UNAVAILABLE;
  }

  if (isConfirmedConnectivityInterruption(connectivity)) {
    return OperationalAvailabilityState.NEEDS_VERIFICATION;
  }

  if (connectivityRequiresVerification(connectivity)) {
    return OperationalAvailabilityState.NEEDS_VERIFICATION;
  }

  if (
    connectivity.overallState === OverallConnectivityState.INTEGRATION_ERROR ||
    connectivity.overallState === OverallConnectivityState.AUTHORIZATION_REQUIRED
  ) {
    return OperationalAvailabilityState.NEEDS_VERIFICATION;
  }

  if (
    connectivity.overallState === OverallConnectivityState.TELEMETRY_ACTIVE ||
    connectivity.overallState === OverallConnectivityState.STANDBY ||
    connectivity.overallState === OverallConnectivityState.SOFT_OFFLINE
  ) {
    return OperationalAvailabilityState.AVAILABLE;
  }

  if (connectivity.overallState === OverallConnectivityState.UNKNOWN) {
    return OperationalAvailabilityState.UNKNOWN;
  }

  return OperationalAvailabilityState.AVAILABLE;
}

export function deriveOperationalAttention(
  connectivity: VehicleConnectivityRuntimeState,
  operationalAvailability: OperationalAvailabilityState,
  businessState: BusinessOperationalState,
  health: HealthEvidenceSnapshot | null | undefined,
): OperatorAttentionLevel {
  if (isBusinessHardBlocked(businessState)) {
    return AttentionState.ACTION_REQUIRED;
  }

  if (
    health?.pipelineAvailability === 'ready' &&
    health.rentalBlocked === true
  ) {
    return AttentionState.CRITICAL;
  }

  if (health?.conditionState === 'critical' && health.pipelineAvailability === 'ready') {
    return maxAttention(connectivity.attentionState, AttentionState.ACTION_REQUIRED);
  }

  if (operationalAvailability === OperationalAvailabilityState.NEEDS_VERIFICATION) {
    return maxAttention(connectivity.attentionState, AttentionState.ACTION_REQUIRED);
  }

  return connectivity.attentionState;
}

function maxAttention(
  a: OperatorAttentionLevel,
  b: OperatorAttentionLevel,
): OperatorAttentionLevel {
  const rank: Record<OperatorAttentionLevel, number> = {
    NONE: 0,
    WATCH: 1,
    ACTION_REQUIRED: 2,
    CRITICAL: 3,
  };
  return rank[a] >= rank[b] ? a : b;
}

export function collectOperationalReasonCodes(
  businessState: BusinessOperationalState,
  connectivity: VehicleConnectivityRuntimeState,
  operationalAvailability: OperationalAvailabilityState,
  health: HealthEvidenceSnapshot | null | undefined,
  episodeEvidenceReliable: boolean | null,
  healthEvaluability: HealthEvaluabilityState,
): OperationalReasonCode[] {
  const codes: OperationalReasonCode[] = [...connectivity.reasonCodes];

  if (isBusinessHardBlocked(businessState)) {
    codes.push(OperationalProjectionReasonCode.BUSINESS_WORKFLOW_BLOCKED);
  }

  if (
    health?.pipelineAvailability === 'ready' &&
    health.rentalBlocked === true
  ) {
    codes.push(OperationalProjectionReasonCode.HEALTH_RENTAL_BLOCKED);
  }

  if (isConfirmedConnectivityInterruption(connectivity)) {
    codes.push(OperationalProjectionReasonCode.CONNECTIVITY_CONFIRMED_INTERRUPTION);
  }

  if (
    operationalAvailability === OperationalAvailabilityState.NEEDS_VERIFICATION &&
    !isConfirmedConnectivityInterruption(connectivity)
  ) {
    codes.push(OperationalProjectionReasonCode.CONNECTIVITY_VERIFICATION_REQUIRED);
  }

  if (episodeEvidenceReliable === false) {
    codes.push(OperationalProjectionReasonCode.INSUFFICIENT_CROSS_DOMAIN_EVIDENCE);
  }

  if (healthEvaluability === HealthEvaluabilityState.NOT_EVALUABLE) {
    codes.push(OperationalProjectionReasonCode.HEALTH_EVIDENCE_UNAVAILABLE);
  } else if (
    healthEvaluability === HealthEvaluabilityState.PARTIALLY_EVALUABLE &&
    health?.anyModuleDataStale
  ) {
    codes.push(OperationalProjectionReasonCode.HEALTH_EVIDENCE_STALE);
  }

  return [...new Set(codes)];
}

function selectPrimaryReason(codes: OperationalReasonCode[]): OperationalReasonCode | null {
  const precedence: OperationalReasonCode[] = [
    OperationalProjectionReasonCode.BUSINESS_WORKFLOW_BLOCKED,
    OperationalProjectionReasonCode.HEALTH_RENTAL_BLOCKED,
    ConnectivityReasonCode.DEVICE_UNPLUG_WEBHOOK,
    OperationalProjectionReasonCode.CONNECTIVITY_CONFIRMED_INTERRUPTION,
    ConnectivityReasonCode.DEVICE_CHECK_REQUIRED,
    OperationalProjectionReasonCode.CONNECTIVITY_VERIFICATION_REQUIRED,
    ConnectivityReasonCode.TELEMETRY_OFFLINE,
    ConnectivityReasonCode.DATA_COVERAGE_INSUFFICIENT,
    OperationalProjectionReasonCode.INSUFFICIENT_CROSS_DOMAIN_EVIDENCE,
  ];

  for (const code of precedence) {
    if (codes.includes(code)) return code;
  }

  return codes[0] ?? null;
}

export function deriveOperatorSummary(
  operationalAvailability: OperationalAvailabilityState,
  connectivity: VehicleConnectivityRuntimeState,
  reasonCodes: OperationalReasonCode[],
): VehicleOperationalOperatorSummary {
  return {
    state: operationalAvailability,
    reasonCodes,
    primaryReason: selectPrimaryReason(reasonCodes),
    recommendedAction: connectivity.recommendedAction,
  };
}

export function buildVehicleOperationalEvidence(
  input: BuildVehicleOperationalProjectionInput,
): VehicleOperationalEvidence {
  const generatedAt = toIso(input.generatedAt);
  return {
    generatedAt,
    latestTelemetryAt: input.connectivity.lastTelemetryAt,
    latestConnectivityEvidenceAt: input.connectivity.calculatedAt,
    healthEvidenceAt: input.health?.generatedAt ?? null,
    healthConditionState: input.health?.conditionState ?? null,
    healthPipelineAvailability: input.health?.pipelineAvailability ?? null,
    anyModuleDataStale: input.health?.anyModuleDataStale ?? null,
    episodeEvidenceReliable: input.episodeEvidenceReliable ?? null,
  };
}

export function buildVehicleOperationalProjection(
  input: BuildVehicleOperationalProjectionInput,
): VehicleOperationalProjection {
  const generatedAt = toIso(input.generatedAt);
  const operationalAvailability = deriveOperationalAvailability(
    input.businessState,
    input.connectivity,
    input.health,
  );
  const healthEvaluability = deriveHealthEvaluability(input.health, input.connectivity);
  const attention = deriveOperationalAttention(
    input.connectivity,
    operationalAvailability,
    input.businessState,
    input.health,
  );
  const reasonCodes = collectOperationalReasonCodes(
    input.businessState,
    input.connectivity,
    operationalAvailability,
    input.health,
    input.episodeEvidenceReliable ?? null,
    healthEvaluability,
  );
  const operatorSummary = deriveOperatorSummary(
    operationalAvailability,
    input.connectivity,
    reasonCodes,
  );

  return {
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    generatedAt,
    projectionVersion: VEHICLE_OPERATIONAL_PROJECTION_VERSION,
    businessState: input.businessState,
    connectivity: input.connectivity,
    operationalAvailability,
    healthEvaluability,
    attention,
    operatorSummary,
    evidence: buildVehicleOperationalEvidence(input),
  };
}

/**
 * Batch projection with a shared `generatedAt` anchor for deterministic freshness.
 * Reuses already-loaded connectivity runtime states — no additional DB access.
 */
export function buildVehicleOperationalProjectionBatch(
  input: BuildVehicleOperationalProjectionBatchInput,
): VehicleOperationalProjection[] {
  const generatedAt = toIso(input.generatedAt);
  return input.projections.map((item) =>
    buildVehicleOperationalProjection({ ...item, generatedAt }),
  );
}
