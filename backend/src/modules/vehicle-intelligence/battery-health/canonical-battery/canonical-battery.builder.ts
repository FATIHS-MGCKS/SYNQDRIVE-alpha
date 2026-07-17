import type { ResolvedBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.types';
import type { BatteryMeasurementType } from '../battery-v2-domain';
import type {
  BatteryDataQualityStatus,
  BatteryDataQualityPresentation,
} from '../battery-data-quality';
import type {
  BatteryDomainFreshnessBundle,
  FetchFreshness,
  LegacyFreshnessInfo,
  ObservationFreshness,
} from '../battery-freshness.policy';
import type { HvMethodProfile } from '../hv-method-profile/hv-method-profile.types';
import type { CanonicalLvBatteryResponse } from '../lv-canonical/lv-canonical-battery.types';
import type { HvSohGateReasonCode } from '../hv-capacity-shadow/hv-soh-gate.types';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import {
  CANONICAL_BATTERY_LIVE_STATUS,
  CANONICAL_BATTERY_RESOLVER_VERSION,
  type CanonicalBatteryDto,
  type CanonicalBatteryHvCapacityAssessment,
  type CanonicalBatteryHvChargeSession,
  type CanonicalBatteryHvReferenceCapacity,
  type CanonicalBatteryHvSohAssessment,
  type CanonicalBatteryLiveStatus,
  type CanonicalBatteryUnsupportedMeasurement,
} from './canonical-battery.types';
import type { BatterySignalError } from '../battery-signal-freshness.contract';
import type { CanonicalBatterySignalFreshnessResult } from './canonical-battery-signal-freshness.builder';
import { BATTERY_MEASUREMENT_TYPES } from '../battery-v2-domain';

export interface CanonicalBatteryHvChargeSessionInput {
  id: string;
  source: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  qualityStatus: string | null;
  capacityShadowEligible: boolean;
  sessionMedianKwh: number | null;
  shadowGatePassed: boolean | null;
}

export interface CanonicalBatteryBuildInput {
  organizationId: string;
  vehicleId: string;
  resolvedAt: Date;
  isEv: boolean;
  policy: ResolvedBatteryPolicy;
  hvMethodProfile: HvMethodProfile;
  lvCanonical: CanonicalLvBatteryResponse;
  lvStatus: CanonicalBatteryLiveStatus;
  hvStatus: CanonicalBatteryLiveStatus;
  lvLive: {
    voltageV: number | null;
    voltageSource: 'live_telemetry' | 'resting_snapshot' | null;
    temperatureC: number | null;
    restingVoltageV: number | null;
    crankingVoltageV: number | null;
    chargingVoltageV: number | null;
    engineRunning: boolean | null;
    observedAt: string | null;
    receivedAt: string | null;
  };
  hvLive: {
    socPercent: number | null;
    rangeKm: number | null;
    currentEnergyKwh: number | null;
    grossCapacityKwh: number | null;
    addedEnergyKwh: number | null;
    chargingPowerKw: number | null;
    currentVoltageV: number | null;
    temperatureC: number | null;
    isCharging: boolean | null;
    chargingCableConnected: boolean | null;
    providerSohPercent: number | null;
    observedAt: string | null;
    receivedAt: string | null;
  };
  hvProviderSoh: {
    percent: number | null;
    source: 'PROVIDER' | 'DOCUMENT' | 'MANUAL' | 'CAPACITY_ESTIMATE' | null;
    observedAt: string | null;
    decisionFresh: boolean;
    evidenceType: string | null;
  };
  referenceCapacity: CanonicalBatteryHvReferenceCapacity | null;
  crossSessionAssessment: CanonicalBatteryHvCapacityAssessment | null;
  sohGateAssessment: CanonicalBatteryHvSohAssessment | null;
  chargeSessions: CanonicalBatteryHvChargeSessionInput[];
  dataQuality: {
    aggregate: BatteryDataQualityPresentation;
    slices: CanonicalBatteryDto['dataQuality']['slices'];
    fetchFreshness: FetchFreshness | null;
    observationFreshness: ObservationFreshness | null;
    lvFreshnessBundle: BatteryDomainFreshnessBundle | null;
    hvFreshnessBundle: BatteryDomainFreshnessBundle | null;
    staleReasons: string[];
    unsupportedReasons: string[];
    errors: BatterySignalError[];
    namedFreshnessSlices: CanonicalBatteryDto['dataQuality']['namedFreshnessSlices'];
  };
  signalFreshness: CanonicalBatterySignalFreshnessResult;
  legacy: CanonicalBatteryDto['legacy'];
}

export function mapChargeSessionInputRow(row: {
  id: string;
  source: string;
  startAt: Date;
  endAt: Date | null;
  isOngoing: boolean;
  metadata: unknown;
}): CanonicalBatteryHvChargeSessionInput {
  const metadata = (row.metadata ?? {}) as HvChargeSessionMetadata;
  return {
    id: row.id,
    source: row.source,
    startAt: row.startAt,
    endAt: row.endAt,
    isOngoing: row.isOngoing,
    qualityStatus: metadata.qualityStatus ?? null,
    capacityShadowEligible: metadata.capacityShadowEligible === true,
    sessionMedianKwh: metadata.m2CapacitySummary?.stats.medianCapacityKwh ?? null,
    shadowGatePassed: metadata.m2CapacitySummary?.shadowGatePassed ?? null,
  };
}

function mapChargeSession(
  row: CanonicalBatteryHvChargeSessionInput,
): CanonicalBatteryHvChargeSession {
  return {
    sessionId: row.id,
    source: row.source,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    isOngoing: row.isOngoing,
    qualityStatus: row.qualityStatus,
    capacityShadowEligible: row.capacityShadowEligible,
    sessionMedianKwh: row.sessionMedianKwh,
    shadowGatePassed: row.shadowGatePassed,
  };
}

function resolveUnsupportedMeasurements(
  policy: ResolvedBatteryPolicy,
  hvMethodProfile: HvMethodProfile,
): CanonicalBatteryUnsupportedMeasurement[] {
  const supported = new Set<string>(policy.supportedMeasurementTypes);
  const unsupported: CanonicalBatteryUnsupportedMeasurement[] = [];

  for (const measurementType of BATTERY_MEASUREMENT_TYPES) {
    if (supported.has(measurementType)) continue;
    const hvReason = hvMethodProfile.unsupportedReasons.find(
      (row) => row.method != null,
    );
    unsupported.push({
      measurementType: measurementType as BatteryMeasurementType,
      reasonCode: hvReason?.code ?? 'POLICY_UNSUPPORTED',
      labelDe: hvReason?.labelDe ?? 'Messart für Fahrzeugprofil nicht unterstützt',
    });
  }

  return unsupported.slice(0, 24);
}

function resolveChargingState(input: CanonicalBatteryBuildInput['hvLive']) {
  const state =
    input.isCharging == null
      ? 'unknown'
      : input.isCharging
        ? 'charging'
        : 'not_charging';
  return {
    isCharging: input.isCharging,
    cableConnected: input.chargingCableConnected,
    powerKw: input.chargingPowerKw,
    state: state as 'charging' | 'not_charging' | 'unknown',
  };
}

export function buildCanonicalBatteryDto(
  input: CanonicalBatteryBuildInput,
): CanonicalBatteryDto {
  const currentChargeSession =
    input.chargeSessions.find((session) => session.isOngoing) ?? null;
  const lastChargeSession =
    input.chargeSessions.find((session) => !session.isOngoing) ?? null;

  return {
    resolverVersion: CANONICAL_BATTERY_RESOLVER_VERSION,
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    resolvedAt: input.resolvedAt.toISOString(),
    isEv: input.isEv,
    liveState: {
      lv: {
        observedAt: input.lvLive.observedAt,
        receivedAt: input.lvLive.receivedAt,
        status: input.lvStatus,
        freshness: input.signalFreshness.live.lv,
        signals: input.signalFreshness.lvSignals,
        values: {
          voltageV: input.lvLive.voltageV,
          voltageSource: input.lvLive.voltageSource,
          temperatureC: input.lvLive.temperatureC,
          restingVoltageV: input.lvLive.restingVoltageV,
          crankingVoltageV: input.lvLive.crankingVoltageV,
          chargingVoltageV: input.lvLive.chargingVoltageV,
          engineRunning: input.lvLive.engineRunning,
        },
      },
      hv: {
        observedAt: input.hvLive.observedAt,
        receivedAt: input.hvLive.receivedAt,
        status: input.hvStatus,
        freshness: input.signalFreshness.live.hv,
        signals: input.signalFreshness.hvSignals,
        values: {
          socPercent: input.hvLive.socPercent,
          rangeKm: input.hvLive.rangeKm,
          currentEnergyKwh: input.hvLive.currentEnergyKwh,
          grossCapacityKwh: input.hvLive.grossCapacityKwh,
          addedEnergyKwh: input.hvLive.addedEnergyKwh,
          chargingPowerKw: input.hvLive.chargingPowerKw,
          currentVoltageV: input.hvLive.currentVoltageV,
          temperatureC: input.hvLive.temperatureC,
          isCharging: input.hvLive.isCharging,
          chargingCableConnected: input.hvLive.chargingCableConnected,
          providerSohPercent: input.hvLive.providerSohPercent,
        },
      },
    },
    lv: {
      profile: input.lvCanonical.profile,
      chemistry: input.lvCanonical.chemistry,
      latestQualifiedRest: input.lvCanonical.latestQualifiedRestMeasurement,
      latestStartProxy: input.lvCanonical.latestStartProxy,
      assessment: input.lvCanonical.assessment,
      publication: input.lvCanonical.publication,
      liveVoltage: input.lvCanonical.liveVoltage,
      canonical: input.lvCanonical,
    },
    hv: input.isEv
      ? {
          supported: true,
          soc: {
            percent: input.hvLive.socPercent,
            observedAt: input.hvLive.observedAt,
          },
          currentEnergy: {
            kwh: input.hvLive.currentEnergyKwh,
            observedAt: input.hvLive.observedAt,
          },
          chargingState: resolveChargingState(input.hvLive),
          currentChargeSession: currentChargeSession
            ? mapChargeSession(currentChargeSession)
            : null,
          lastChargeSession: lastChargeSession
            ? mapChargeSession(lastChargeSession)
            : null,
          capacityAssessment: input.crossSessionAssessment,
          providerSoh: input.hvProviderSoh,
          referenceCapacity: input.referenceCapacity,
          sohAssessment: input.sohGateAssessment,
        }
      : null,
    capabilities: {
      policy: input.policy,
      hvMethodProfile: input.hvMethodProfile,
      supportedMeasurementTypes: [...input.policy.supportedMeasurementTypes],
      unsupportedMeasurementTypes: resolveUnsupportedMeasurements(
        input.policy,
        input.hvMethodProfile,
      ),
    },
    dataQuality: input.dataQuality,
    legacy: input.legacy,
  };
}

export function mapLiveStatusFromLegacy(
  status: string,
): CanonicalBatteryLiveStatus {
  switch (status) {
    case 'ready':
      return CANONICAL_BATTERY_LIVE_STATUS.READY;
    case 'calibrating':
      return CANONICAL_BATTERY_LIVE_STATUS.CALIBRATING;
    case 'stabilizing':
      return CANONICAL_BATTERY_LIVE_STATUS.STABILIZING;
    case 'no_recent_data':
      return CANONICAL_BATTERY_LIVE_STATUS.NO_RECENT_DATA;
    case 'unsupported':
      return CANONICAL_BATTERY_LIVE_STATUS.UNSUPPORTED;
    default:
      return CANONICAL_BATTERY_LIVE_STATUS.ESTIMATE_UNAVAILABLE;
  }
}

export function mapCrossSessionAssessmentRow(
  row: {
    id: string;
    scoreValue: number | null;
    confidence: string | null;
    modelVersion: number;
    computedAt: Date;
    inputSummary: unknown;
  } | null,
): CanonicalBatteryHvCapacityAssessment | null {
  if (!row) return null;
  const summary =
    row.inputSummary && typeof row.inputSummary === 'object'
      ? (row.inputSummary as Record<string, unknown>)
      : {};
  return {
    assessmentId: row.id,
    estimatedUsableCapacityKwh: row.scoreValue,
    confidence:
      typeof summary.confidence === 'string' ? summary.confidence : row.confidence,
    maturity: typeof summary.maturity === 'string' ? summary.maturity : null,
    shadowGatePassed: summary.shadowGatePassed === true,
    gateReasonCodes: Array.isArray(summary.gateReasonCodes)
      ? (summary.gateReasonCodes as string[])
      : [],
    sessionCount: typeof summary.sessionCount === 'number' ? summary.sessionCount : 0,
    computedAt: row.computedAt.toISOString(),
    modelVersion: row.modelVersion,
  };
}

export function mapSohGateAssessmentRow(
  row: {
    id: string;
    scoreValue: number | null;
    confidence: string | null;
    modelVersion: number;
    computedAt: Date;
    inputSummary: unknown;
  } | null,
): CanonicalBatteryHvSohAssessment | null {
  if (!row) return null;
  const summary =
    row.inputSummary && typeof row.inputSummary === 'object'
      ? (row.inputSummary as Record<string, unknown>)
      : {};
  return {
    assessmentId: row.id,
    sohAvailability:
      typeof summary.sohAvailability === 'string' ? summary.sohAvailability : null,
    estimatedSohPercent: row.scoreValue,
    estimatedUsableCapacityKwh:
      typeof summary.estimatedUsableCapacityKwh === 'number'
        ? summary.estimatedUsableCapacityKwh
        : null,
    verifiedReferenceCapacityKwh:
      typeof summary.verifiedReferenceCapacityKwh === 'number'
        ? summary.verifiedReferenceCapacityKwh
        : null,
    maturity: typeof summary.maturity === 'string' ? summary.maturity : null,
    confidence:
      typeof summary.confidence === 'string' ? summary.confidence : row.confidence,
    sohGatePassed: summary.sohGatePassed === true,
    gateReasonCodes: Array.isArray(summary.gateReasonCodes)
      ? (summary.gateReasonCodes as HvSohGateReasonCode[])
      : [],
    sohPublicationEnabled: summary.sohPublicationEnabled === true,
    computedAt: row.computedAt.toISOString(),
    modelVersion: row.modelVersion,
  };
}

export function mapReferenceCapacityRow(
  row: {
    id: string;
    capacityKwh: number;
    capacityType: string;
    source: string;
    verificationStatus: string;
    verifiedAt: Date | null;
  } | null,
): CanonicalBatteryHvReferenceCapacity | null {
  if (!row) return null;
  return {
    id: row.id,
    capacityKwh: row.capacityKwh,
    capacityType: row.capacityType,
    source: row.source,
    verificationStatus: row.verificationStatus,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}

export function collectStaleReasons(input: {
  lvFreshness: LegacyFreshnessInfo;
  hvFreshness: LegacyFreshnessInfo;
  lvStatus: string;
  hvStatus: string;
  isEv: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.lvFreshness.isFresh) {
    reasons.push('LV observation stale or missing');
  }
  if (input.isEv && !input.hvFreshness.isFresh) {
    reasons.push('HV observation stale or missing');
  }
  if (input.lvStatus === 'no_recent_data') {
    reasons.push('No recent LV sample');
  }
  if (input.isEv && input.hvStatus === 'no_recent_data') {
    reasons.push('No recent HV sample');
  }
  return reasons;
}

export function collectUnsupportedReasons(input: {
  lvCanonical: CanonicalLvBatteryResponse;
  policy: ResolvedBatteryPolicy;
  hvMethodProfile: HvMethodProfile;
  isEv: boolean;
}): string[] {
  const reasons: string[] = [];
  if (input.lvCanonical.unsupported) {
    reasons.push('LV assessment unsupported for vehicle profile');
  }
  if (!input.policy.lvAssessmentAllowed) {
    reasons.push('LV assessment not allowed by policy profile');
  }
  for (const row of input.hvMethodProfile.unsupportedReasons) {
    reasons.push(row.labelDe);
  }
  if (!input.isEv) {
    reasons.push('HV traction battery not applicable (non-EV profile)');
  }
  return reasons;
}

export type { BatteryDataQualityStatus };
