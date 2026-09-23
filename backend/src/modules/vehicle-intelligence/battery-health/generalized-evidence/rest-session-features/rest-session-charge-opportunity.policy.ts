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
import { CHARGE_OPPORTUNITY_RAW_POLICY_VERSION } from './charge-opportunity.constants';
import { isTimestampInChargeWindow } from './charge-opportunity-window.policy';
import type {
  ChargeContextCompletenessReason,
  ChargeOpportunityGeObservationInput,
  ChargeOpportunityRawFeaturesV1,
  ResolvedChargeOpportunityWindow,
} from './charge-opportunity.types';

function sortIds(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
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

function isVoltageQualified(
  row: ChargeOpportunityGeObservationInput,
  window: ResolvedChargeOpportunityWindow,
): boolean {
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
  if (isStaleReplay(row.evidenceClass)) return false;
  if (row.engineRunning !== true) return false;
  if (row.stateTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT) return false;
  return isTimestampInChargeWindow(row.stateObservedAt, window);
}

/** In-window by qualified voltage time or any non-unknown state timestamp in window. */
export function rowHasAnyChargeWindowTimestamp(
  row: ChargeOpportunityGeObservationInput,
  window: ResolvedChargeOpportunityWindow,
): boolean {
  if (isStaleReplay(row.evidenceClass)) return false;
  if (window.windowSource === 'NONE' || window.chargeContextStartAt == null) return false;
  if (isVoltageQualified(row, window)) return true;
  return (
    isTimestampInChargeWindow(row.stateObservedAt, window) &&
    row.stateTimestampSource != null &&
    row.stateTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.UNKNOWN
  );
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
  const { window, observations, restSessionId } = input;
  const precedingTripId = window.precedingTripId;
  const reasons: ChargeContextCompletenessReason[] = [...window.completenessReasons];

  let foreignTripObservationCount = 0;
  let stateFetchTimeOnlyObservationCount = 0;

  const materialObservationIds = new Set<string>();
  const materialMeasurementIds = new Set<string>();
  const qualifiedLvObservationIds: string[] = [];
  const qualifiedLvSourceMeasurementIds: string[] = [];
  const engineRunningProviderSnapshotObservationIds: string[] = [];
  const engineRunningProviderSnapshotSourceMeasurementIds: string[] = [];
  const runningAlternatorAlignedObservationIds: string[] = [];
  const runningAlternatorAlignedSourceMeasurementIds: string[] = [];
  const runningAlternatorPartialObservationIds: string[] = [];
  const runningAlternatorPartialSourceMeasurementIds: string[] = [];

  let qualifiedLvObservationCount = 0;
  let alternatorBandLvSampleCount = 0;
  let engineRunningTrueProviderSnapshotObservationCount = 0;
  let runningAlternatorAlignedObservationCount = 0;
  let runningAlternatorPartialObservationCount = 0;
  let classifierDrivingChargingObservationCount = 0;

  const markMaterial = (row: ChargeOpportunityGeObservationInput) => {
    materialObservationIds.add(row.id);
    materialMeasurementIds.add(row.sourceMeasurementId);
  };

  for (const row of observations) {
    if (isStaleReplay(row.evidenceClass)) continue;
    if (!rowHasAnyChargeWindowTimestamp(row, window)) continue;

    if (isForeignTripRow(row, precedingTripId)) {
      foreignTripObservationCount += 1;
      continue;
    }

    let rowMaterial = false;

    if (isEngineRunningFetchTimeOnly(row, window)) {
      stateFetchTimeOnlyObservationCount += 1;
      rowMaterial = true;
    }

    if (row.evidenceClass === BatteryGeneralizedEvidenceClass.DRIVING_CHARGING) {
      classifierDrivingChargingObservationCount += 1;
      rowMaterial = true;
    }

    if (isVoltageQualified(row, window)) {
      qualifiedLvObservationCount += 1;
      qualifiedLvObservationIds.push(row.id);
      qualifiedLvSourceMeasurementIds.push(row.sourceMeasurementId);
      rowMaterial = true;
      if (row.voltage != null && row.voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V) {
        alternatorBandLvSampleCount += 1;
      }
    }

    if (isEngineRunningProviderSnapshot(row, window)) {
      engineRunningTrueProviderSnapshotObservationCount += 1;
      engineRunningProviderSnapshotObservationIds.push(row.id);
      engineRunningProviderSnapshotSourceMeasurementIds.push(row.sourceMeasurementId);
      rowMaterial = true;
    }

    const voltageOk = isVoltageQualified(row, window);
    const engineOk = isEngineRunningProviderSnapshot(row, window);
    const alternatorOk =
      voltageOk && row.voltage != null && row.voltage >= SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V;

    if (engineOk && alternatorOk) {
      if (row.stateAlignmentClass === BatteryShutdownStateAlignmentClass.ALIGNED) {
        runningAlternatorAlignedObservationCount += 1;
        runningAlternatorAlignedObservationIds.push(row.id);
        runningAlternatorAlignedSourceMeasurementIds.push(row.sourceMeasurementId);
        rowMaterial = true;
      } else if (row.stateAlignmentClass === BatteryShutdownStateAlignmentClass.PARTIAL) {
        runningAlternatorPartialObservationCount += 1;
        runningAlternatorPartialObservationIds.push(row.id);
        runningAlternatorPartialSourceMeasurementIds.push(row.sourceMeasurementId);
        rowMaterial = true;
      }
    }

    if (rowMaterial) {
      markMaterial(row);
    }
  }

  const chargeContextSourceObservationIds = sortIds([...materialObservationIds]);
  const chargeContextSourceMeasurementIds = sortIds([...materialMeasurementIds]);

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

  reasons.push('PRIOR_SESSION_FEATURE_NOT_RESOLVED_IN_C2');

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
    restSessionId,
    windowSource: window.windowSource,
    precedingTripId: window.precedingTripId,
    precedingTripStartAt: window.precedingTripStartAt?.toISOString() ?? null,
    precedingTripEndAt: window.precedingTripEndAt?.toISOString() ?? null,
    chargeContextStartAt: window.chargeContextStartAt?.toISOString() ?? null,
    chargeContextEndAt: window.chargeContextEndAt.toISOString(),
    tripEndToAnchorDeltaMs: window.tripEndToAnchorDeltaMs,
    precedingTripDurationMs: window.precedingTripDurationMs,
    precedingTripDistanceKm: window.precedingTripDistanceKm,
    generalizedEvidenceRowsConsidered: chargeContextSourceObservationIds.length,
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
    chargeContextSourceObservationIds,
    chargeContextSourceMeasurementIds,
    qualifiedLvObservationIds: sortIds(qualifiedLvObservationIds),
    qualifiedLvSourceMeasurementIds: sortIds(qualifiedLvSourceMeasurementIds),
    engineRunningProviderSnapshotObservationIds: sortIds(
      engineRunningProviderSnapshotObservationIds,
    ),
    engineRunningProviderSnapshotSourceMeasurementIds: sortIds(
      engineRunningProviderSnapshotSourceMeasurementIds,
    ),
    runningAlternatorAlignedObservationIds: sortIds(runningAlternatorAlignedObservationIds),
    runningAlternatorAlignedSourceMeasurementIds: sortIds(
      runningAlternatorAlignedSourceMeasurementIds,
    ),
    runningAlternatorPartialObservationIds: sortIds(runningAlternatorPartialObservationIds),
    runningAlternatorPartialSourceMeasurementIds: sortIds(
      runningAlternatorPartialSourceMeasurementIds,
    ),
  };
}
