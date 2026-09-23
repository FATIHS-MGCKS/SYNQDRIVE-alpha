import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionChargeOpportunityClass,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import { isPlausibleLvVoltage } from '../generalized-evidence-classification.helpers';
import {
  SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V,
  SHUTDOWN_TIMESTAMP_SOURCES,
} from '../../shutdown-evidence/shutdown-evidence.constants';
import {
  CHARGE_OPPORTUNITY_RAW_POLICY_VERSION,
} from './charge-opportunity.constants';
import { isTimestampInChargeWindow } from './charge-opportunity-window.policy';
import type {
  ChargeContextCompletenessReason,
  ChargeOpportunityGeObservationInput,
  ChargeOpportunityRawFeaturesV1,
  ResolvedChargeOpportunityWindow,
} from './charge-opportunity.types';

function sortIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function sortReasons(reasons: ChargeContextCompletenessReason[]): ChargeContextCompletenessReason[] {
  return [...new Set(reasons)].sort();
}

function isStaleReplay(evidenceClass: string): boolean {
  return evidenceClass === BatteryGeneralizedEvidenceClass.STALE_REPLAY;
}

function isForeignTripRow(
  row: ChargeOpportunityGeObservationInput,
  precedingTripId: string | null,
): boolean {
  if (precedingTripId == null) return false;
  if (row.tripId == null) return false;
  return row.tripId !== precedingTripId;
}

function isVoltageQualified(row: ChargeOpportunityGeObservationInput, window: ResolvedChargeOpportunityWindow): boolean {
  if (isStaleReplay(row.evidenceClass)) return false;
  if (row.providerTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP) return false;
  if (!isPlausibleLvVoltage(row.voltage)) return false;
  return isTimestampInChargeWindow(row.voltageObservedAt, window);
}

function isEngineRunningProviderSnapshot(
  row: ChargeOpportunityGeObservationInput,
  window: ResolvedChargeOpportunityWindow,
): boolean {
  if (isStaleReplay(row.evidenceClass)) return false;
  if (row.engineRunning !== true) return false;
  if (row.stateTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP) return false;
  return isTimestampInChargeWindow(row.stateObservedAt, window);
}

function isEngineRunningFetchTimeOnly(
  row: ChargeOpportunityGeObservationInput,
  window: ResolvedChargeOpportunityWindow,
): boolean {
  if (row.engineRunning !== true) return false;
  if (row.stateTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT) return false;
  return isTimestampInChargeWindow(row.stateObservedAt, window);
}

function isRowConsidered(
  row: ChargeOpportunityGeObservationInput,
  window: ResolvedChargeOpportunityWindow,
  precedingTripId: string | null,
): boolean {
  if (isStaleReplay(row.evidenceClass)) return false;
  if (isForeignTripRow(row, precedingTripId)) return false;
  if (window.windowSource === 'NONE') return false;
  const voltageIn = isVoltageQualified(row, window);
  const stateIn =
    isTimestampInChargeWindow(row.stateObservedAt, window) &&
    row.stateTimestampSource != null &&
    row.stateTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN;
  return voltageIn || stateIn;
}

function resolveTemperatureContext(input: {
  window: ResolvedChargeOpportunityWindow;
  anchorAt: Date;
}): Pick<
  ChargeOpportunityRawFeaturesV1,
  | 'temperatureC'
  | 'temperatureSource'
  | 'temperatureObservedAt'
  | 'temperatureAgeMs'
  | 'temperatureUncertainty'
> {
  const temp = input.window.outsideTemperatureStartC;
  if (
    input.window.windowSource !== 'NONE' &&
    input.window.precedingTripStartAt != null &&
    temp != null &&
    Number.isFinite(temp)
  ) {
    const start = input.window.precedingTripStartAt;
    return {
      temperatureC: temp,
      temperatureSource: 'TRIP_EXTERIOR',
      temperatureObservedAt: start.toISOString(),
      temperatureAgeMs: input.anchorAt.getTime() - start.getTime(),
      temperatureUncertainty: null,
    };
  }
  return {
    temperatureC: null,
    temperatureSource: 'UNKNOWN',
    temperatureObservedAt: null,
    temperatureAgeMs: null,
    temperatureUncertainty: null,
  };
}

export function computeChargeOpportunityRawFeaturesV1(input: {
  restSessionId: string;
  window: ResolvedChargeOpportunityWindow;
  observations: ChargeOpportunityGeObservationInput[];
}): ChargeOpportunityRawFeaturesV1 {
  const { window, observations } = input;
  const precedingTripId = window.precedingTripId;
  const reasons: ChargeContextCompletenessReason[] = [...window.completenessReasons];

  let foreignTripObservationCount = 0;
  let stateFetchTimeOnlyObservationCount = 0;
  let rowsConsidered = 0;

  const chargeContextSourceObservationIds: string[] = [];
  const qualifiedLvObservationIds: string[] = [];
  const engineRunningProviderSnapshotObservationIds: string[] = [];
  const runningAlternatorAlignedObservationIds: string[] = [];
  const runningAlternatorPartialObservationIds: string[] = [];

  let qualifiedLvObservationCount = 0;
  let alternatorBandLvSampleCount = 0;
  let engineRunningTrueProviderSnapshotObservationCount = 0;
  let runningAlternatorAlignedObservationCount = 0;
  let runningAlternatorPartialObservationCount = 0;
  let classifierDrivingChargingObservationCount = 0;

  for (const row of observations) {
    if (isForeignTripRow(row, precedingTripId)) {
      foreignTripObservationCount += 1;
      continue;
    }
    if (isEngineRunningFetchTimeOnly(row, window)) {
      stateFetchTimeOnlyObservationCount += 1;
    }
    if (!isRowConsidered(row, window, precedingTripId)) continue;

    rowsConsidered += 1;
    chargeContextSourceObservationIds.push(row.id);

    if (row.evidenceClass === BatteryGeneralizedEvidenceClass.DRIVING_CHARGING) {
      classifierDrivingChargingObservationCount += 1;
    }

    if (isVoltageQualified(row, window)) {
      qualifiedLvObservationCount += 1;
      qualifiedLvObservationIds.push(row.id);
      if (row.voltage != null && row.voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V) {
        alternatorBandLvSampleCount += 1;
      }
    }

    if (isEngineRunningProviderSnapshot(row, window)) {
      engineRunningTrueProviderSnapshotObservationCount += 1;
      engineRunningProviderSnapshotObservationIds.push(row.id);
    }

    const voltageOk = isVoltageQualified(row, window);
    const engineOk = isEngineRunningProviderSnapshot(row, window);
    const alternatorOk =
      voltageOk && row.voltage != null && row.voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V;

    if (engineOk && alternatorOk) {
      if (row.stateAlignmentClass === BatteryShutdownStateAlignmentClass.ALIGNED) {
        runningAlternatorAlignedObservationCount += 1;
        runningAlternatorAlignedObservationIds.push(row.id);
      } else if (row.stateAlignmentClass === BatteryShutdownStateAlignmentClass.PARTIAL) {
        runningAlternatorPartialObservationCount += 1;
        runningAlternatorPartialObservationIds.push(row.id);
      }
    }
  }

  if (window.windowSource !== 'NONE') {
    if (qualifiedLvObservationCount === 0) {
      reasons.push('NO_PROVIDER_QUALIFIED_LV');
    }
    if (engineRunningTrueProviderSnapshotObservationCount === 0) {
      if (stateFetchTimeOnlyObservationCount > 0) {
        reasons.push('STATE_FETCH_TIME_ONLY');
      }
      reasons.push('NO_PROVIDER_OBSERVED_STATE');
    }
  }

  if (foreignTripObservationCount > 0) {
    reasons.push('FOREIGN_TRIP_OBSERVATIONS_EXCLUDED');
  }

  reasons.push('NO_PRIOR_SESSION_FEATURE');

  if (
    resolveTemperatureContext({ window, anchorAt: window.chargeContextEndAt }).temperatureC == null &&
    window.windowSource !== 'NONE'
  ) {
    if (!reasons.includes('MISSING_TEMPERATURE')) {
      reasons.push('MISSING_TEMPERATURE');
    }
  }

  const temperature = resolveTemperatureContext({
    window,
    anchorAt: window.chargeContextEndAt,
  });

  return {
    policyVersion: CHARGE_OPPORTUNITY_RAW_POLICY_VERSION,
    windowSource: window.windowSource,
    precedingTripId: window.precedingTripId,
    precedingTripStartAt: window.precedingTripStartAt?.toISOString() ?? null,
    precedingTripEndAt: window.precedingTripEndAt?.toISOString() ?? null,
    chargeContextStartAt: window.chargeContextStartAt?.toISOString() ?? null,
    chargeContextEndAt: window.chargeContextEndAt.toISOString(),
    tripEndToAnchorDeltaMs: window.tripEndToAnchorDeltaMs,
    precedingTripDurationMs: window.precedingTripDurationMs,
    precedingTripDistanceKm: window.precedingTripDistanceKm,
    generalizedEvidenceRowsConsidered: rowsConsidered,
    qualifiedLvObservationCount,
    alternatorBandLvSampleCount,
    engineRunningTrueProviderSnapshotObservationCount,
    runningAlternatorAlignedObservationCount,
    runningAlternatorPartialObservationCount,
    classifierDrivingChargingObservationCount,
    foreignTripObservationCount,
    stateFetchTimeOnlyObservationCount,
    engineRunningObservedCoverageMs: null,
    lvVoltageTimeProxyVms: null,
    lvVoltageTimeProxyCoveredMs: null,
    priorSessionMedianRestVoltageMv: null,
    ...temperature,
    contextCompleteness: sortReasons(reasons),
    chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    chargeContextSourceObservationIds: sortIds(chargeContextSourceObservationIds),
    qualifiedLvObservationIds: sortIds(qualifiedLvObservationIds),
    engineRunningProviderSnapshotObservationIds: sortIds(
      engineRunningProviderSnapshotObservationIds,
    ),
    runningAlternatorAlignedObservationIds: sortIds(runningAlternatorAlignedObservationIds),
    runningAlternatorPartialObservationIds: sortIds(runningAlternatorPartialObservationIds),
  };
}
