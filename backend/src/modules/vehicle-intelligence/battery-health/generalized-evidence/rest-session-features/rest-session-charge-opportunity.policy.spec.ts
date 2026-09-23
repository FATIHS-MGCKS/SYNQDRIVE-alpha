import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionChargeOpportunityClass,
  BatteryShutdownStateAlignmentClass,
  TripStatus,
} from '@prisma/client';
import { SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V } from '../../shutdown-evidence/shutdown-evidence.constants';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import { TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS } from '../generalized-evidence.constants';
import { resolveChargeOpportunityWindow } from './charge-opportunity-window.policy';
import type {
  ChargeOpportunityGeObservationInput,
  ChargeOpportunityRestSessionSnapshot,
  ChargeOpportunityTripSnapshot,
  ResolvedChargeOpportunityWindow,
} from './charge-opportunity.types';
import { computeChargeOpportunityRawFeaturesV1 } from './rest-session-charge-opportunity.policy';

const VEHICLE = 'vehicle-1';
const ORG = 'org-1';
const SESSION = 'session-1';
const TRIP = 'trip-1';

const ANCHOR = new Date('2026-09-22T13:50:28.000Z');
const TRIP_START = new Date('2026-09-22T13:44:00.000Z');
const TRIP_END = new Date('2026-09-22T13:50:25.000Z');

function trip(overrides: Partial<ChargeOpportunityTripSnapshot> = {}): ChargeOpportunityTripSnapshot {
  return {
    id: TRIP,
    vehicleId: VEHICLE,
    tripStatus: TripStatus.COMPLETED,
    startTime: TRIP_START,
    endTime: TRIP_END,
    distanceKm: 1.6,
    outsideTemperatureStartC: 23,
    ...overrides,
  };
}

function session(
  overrides: Partial<ChargeOpportunityRestSessionSnapshot> = {},
): ChargeOpportunityRestSessionSnapshot {
  return {
    id: SESSION,
    organizationId: ORG,
    vehicleId: VEHICLE,
    anchorAt: ANCHOR,
    confirmedTripId: TRIP,
    candidateTripId: null,
    ...overrides,
  };
}

function confirmedWindow(): ResolvedChargeOpportunityWindow {
  return resolveChargeOpportunityWindow({
    session: session(),
    confirmedTrip: trip(),
    candidateTrip: null,
  });
}

function geRow(
  overrides: Partial<ChargeOpportunityGeObservationInput> & { id: string },
): ChargeOpportunityGeObservationInput {
  const base: ChargeOpportunityGeObservationInput = {
    id: overrides.id,
    sourceMeasurementId: overrides.sourceMeasurementId ?? `meas-${overrides.id}`,
    organizationId: ORG,
    vehicleId: VEHICLE,
    tripId: TRIP,
    evidenceClass: BatteryGeneralizedEvidenceClass.CHARGING_CONTAMINATED,
    voltage: 14.2,
    voltageObservedAt: new Date('2026-09-22T13:48:00.000Z'),
    providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    engineRunning: true,
    stateObservedAt: new Date('2026-09-22T13:48:00.000Z'),
    stateTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    isLvCharging: true,
    isHvCharging: false,
  };
  return { ...base, ...overrides };
}

describe('charge-opportunity-window.policy (M3.3C C2)', () => {
  it('TEST_A_CONFIRMED_TRIP: valid confirmed trip resolves window', () => {
    const window = confirmedWindow();
    expect(window.windowSource).toBe('CONFIRMED_TRIP');
    expect(window.chargeContextStartAt?.toISOString()).toBe(TRIP_START.toISOString());
    expect(window.chargeContextEndAt.toISOString()).toBe(ANCHOR.toISOString());
    expect(window.tripEndToAnchorDeltaMs).toBe(3000);
  });

  it('TEST_B_CANDIDATE_TRIP: candidate-only link', () => {
    const window = resolveChargeOpportunityWindow({
      session: session({ confirmedTripId: null, candidateTripId: TRIP }),
      confirmedTrip: null,
      candidateTrip: trip(),
    });
    expect(window.windowSource).toBe('CANDIDATE_TRIP');
    expect(window.completenessReasons).toContain('CANDIDATE_TRIP_CONTEXT');
  });

  it('TEST_C_ANCHOR_MISMATCH: invalid end tolerance → NONE', () => {
    const badEnd = new Date(ANCHOR.getTime() - TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS - 1000);
    const window = resolveChargeOpportunityWindow({
      session: session(),
      confirmedTrip: trip({ endTime: badEnd }),
      candidateTrip: null,
    });
    expect(window.windowSource).toBe('NONE');
    expect(window.completenessReasons).toContain('TRIP_END_ANCHOR_MISMATCH');
  });

  it('TEST_D_NO_LINK: no trip ids → NONE', () => {
    const window = resolveChargeOpportunityWindow({
      session: session({ confirmedTripId: null, candidateTripId: null }),
      confirmedTrip: null,
      candidateTrip: null,
    });
    expect(window.windowSource).toBe('NONE');
    expect(window.completenessReasons).toEqual(['NO_RELIABLE_PRECEDING_TRIP']);
  });

  it('TEST_T: missing linked trip row → TRIP_LINK_NOT_FOUND', () => {
    const window = resolveChargeOpportunityWindow({
      session: session(),
      confirmedTrip: null,
      candidateTrip: null,
    });
    expect(window.windowSource).toBe('NONE');
    expect(window.completenessReasons).toContain('TRIP_LINK_NOT_FOUND');
  });

  it('TEST_U: trip vehicle mismatch → TRIP_VEHICLE_MISMATCH', () => {
    const window = resolveChargeOpportunityWindow({
      session: session(),
      confirmedTrip: trip({ vehicleId: 'other-vehicle' }),
      candidateTrip: null,
    });
    expect(window.windowSource).toBe('NONE');
    expect(window.completenessReasons).toContain('TRIP_VEHICLE_MISMATCH');
  });

  it('TEST_V: end before start → TRIP_END_BEFORE_START', () => {
    const window = resolveChargeOpportunityWindow({
      session: session(),
      confirmedTrip: trip({
        startTime: TRIP_END,
        endTime: TRIP_START,
      }),
      candidateTrip: null,
    });
    expect(window.windowSource).toBe('NONE');
    expect(window.completenessReasons).toContain('TRIP_END_BEFORE_START');
  });

  it('zero-duration trip start==end is valid metadata', () => {
    const instant = TRIP_END;
    const window = resolveChargeOpportunityWindow({
      session: session(),
      confirmedTrip: trip({ startTime: instant, endTime: instant }),
      candidateTrip: null,
    });
    expect(window.windowSource).toBe('CONFIRMED_TRIP');
    expect(window.precedingTripDurationMs).toBe(0);
    expect(window.chargeContextEndAt.toISOString()).toBe(ANCHOR.toISOString());
  });
});

describe('rest-session-charge-opportunity.policy (M3.3C C2 A–O)', () => {
  it('TEST_A_CONFIRMED_TRIP: raw counts from qualified rows', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({ id: 'a1' }),
        geRow({
          id: 'a2',
          voltage: 13.0,
          engineRunning: false,
          stateObservedAt: new Date('2026-09-22T13:47:00.000Z'),
          voltageObservedAt: new Date('2026-09-22T13:47:00.000Z'),
        }),
      ],
    });
    expect(features.windowSource).toBe('CONFIRMED_TRIP');
    expect(features.qualifiedLvObservationCount).toBe(2);
    expect(features.alternatorBandLvSampleCount).toBe(1);
    expect(features.engineRunningTrueProviderSnapshotObservationCount).toBe(1);
  });

  it('TEST_E_FUTURE_ROW: timestamps at/after anchor excluded', () => {
    const window = confirmedWindow();
    const after = new Date(ANCHOR.getTime() + 1000);
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({
          id: 'future-v',
          voltageObservedAt: ANCHOR,
          stateObservedAt: after,
        }),
        geRow({
          id: 'future-s',
          voltageObservedAt: after,
          stateObservedAt: after,
        }),
      ],
    });
    expect(features.generalizedEvidenceRowsConsidered).toBe(0);
    expect(features.qualifiedLvObservationCount).toBe(0);
  });

  it('TEST_F_STALE: STALE_REPLAY contributes zero', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({
          id: 'stale',
          evidenceClass: BatteryGeneralizedEvidenceClass.STALE_REPLAY,
        }),
      ],
    });
    expect(features.generalizedEvidenceRowsConsidered).toBe(0);
  });

  it('TEST_G_ALTERNATOR: canonical 13.8V threshold boundary', () => {
    const window = confirmedWindow();
    const below = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({ id: 'b799', voltage: 13.799 }),
      ],
    });
    const at = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({ id: 'b800', voltage: 13.8 }),
      ],
    });
    expect(below.alternatorBandLvSampleCount).toBe(0);
    expect(at.alternatorBandLvSampleCount).toBe(1);
    expect(SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V).toBe(13.8);
  });

  it('TEST_H_STATE_SOURCE: snapshot counts; fetch time does not', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({ id: 'snap' }),
        geRow({
          id: 'fetch',
          stateTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT,
        }),
      ],
    });
    expect(features.engineRunningTrueProviderSnapshotObservationCount).toBe(1);
    expect(features.stateFetchTimeOnlyObservationCount).toBe(1);
  });

  it('TEST_I_ALIGNED_COMBINED: aligned running+alternator count', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [geRow({ id: 'aligned' })],
    });
    expect(features.runningAlternatorAlignedObservationCount).toBe(1);
    expect(features.runningAlternatorPartialObservationCount).toBe(0);
  });

  it('TEST_J_PARTIAL_COMBINED: partial alignment only', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({
          id: 'partial',
          stateAlignmentClass: BatteryShutdownStateAlignmentClass.PARTIAL,
        }),
      ],
    });
    expect(features.runningAlternatorPartialObservationCount).toBe(1);
    expect(features.runningAlternatorAlignedObservationCount).toBe(0);
  });

  it('TEST_K_SKEWED: skewed alignment excluded from combined counts', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({
          id: 'skewed',
          stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
        }),
      ],
    });
    expect(features.runningAlternatorAlignedObservationCount).toBe(0);
    expect(features.runningAlternatorPartialObservationCount).toBe(0);
  });

  it('TEST_L_MISSING_DISTANCE: distance null preserves other counts', () => {
    const window = resolveChargeOpportunityWindow({
      session: session(),
      confirmedTrip: trip({ distanceKm: null }),
      candidateTrip: null,
    });
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [geRow({ id: 'd1' })],
    });
    expect(features.qualifiedLvObservationCount).toBe(1);
    expect(features.contextCompleteness).toContain('MISSING_DISTANCE');
  });

  it('TEST_M_TEMPERATURE: trip exterior context', () => {
    const window = confirmedWindow();
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [],
    });
    expect(features.temperatureSource).toBe('TRIP_EXTERIOR');
    expect(features.temperatureC).toBe(23);
    expect(features.temperatureObservedAt).toBe(TRIP_START.toISOString());
  });

  it('TEST_M_TEMPERATURE missing on NONE window', () => {
    const window = resolveChargeOpportunityWindow({
      session: session({ confirmedTripId: null, candidateTripId: null }),
      confirmedTrip: null,
      candidateTrip: null,
    });
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [],
    });
    expect(features.temperatureSource).toBe('UNKNOWN');
    expect(features.temperatureC).toBeNull();
  });

  it('TEST_N_CLASSIFICATION: chargeOpportunityClass always UNKNOWN', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [geRow({ id: 'n1' })],
    });
    expect(features.chargeOpportunityClass).toBe(
      BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    );
  });

  it('TEST_O_NO_COVERAGE_PROXY: duration/integration null', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [geRow({ id: 'o1' })],
    });
    expect(features.engineRunningObservedCoverageMs).toBeNull();
    expect(features.lvVoltageTimeProxyVms).toBeNull();
    expect(features.lvVoltageTimeProxyCoveredMs).toBeNull();
  });

  it('foreign trip rows excluded from counts', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [geRow({ id: 'foreign', tripId: 'other-trip' })],
    });
    expect(features.foreignTripObservationCount).toBe(1);
    expect(features.qualifiedLvObservationCount).toBe(0);
    expect(features.contextCompleteness).toContain('FOREIGN_TRIP_OBSERVATIONS_EXCLUDED');
  });

  it('classifierDrivingChargingObservationCount is diagnostic only', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [
        geRow({
          id: 'dc',
          evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_CHARGING,
        }),
      ],
    });
    expect(features.classifierDrivingChargingObservationCount).toBe(1);
    expect(features.chargeOpportunityClass).toBe(
      BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    );
  });

  it('TEST_P: restSessionId retained in raw output', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: 'session-123',
      window: confirmedWindow(),
      observations: [],
    });
    expect(features.restSessionId).toBe('session-123');
  });

  it('TEST_Q: sourceMeasurement provenance retained', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [geRow({ id: 'q1', sourceMeasurementId: 'measurement-X' })],
    });
    expect(features.qualifiedLvSourceMeasurementIds).toContain('measurement-X');
    expect(features.chargeContextSourceMeasurementIds).toContain('measurement-X');
  });

  it('TEST_R: STALE_REPLAY fetch-time state contributes zero', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [
        geRow({
          id: 'stale-fetch',
          evidenceClass: BatteryGeneralizedEvidenceClass.STALE_REPLAY,
          stateTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT,
          engineRunning: true,
        }),
      ],
    });
    expect(features.stateFetchTimeOnlyObservationCount).toBe(0);
    expect(features.contextCompleteness).not.toContain('STATE_FETCH_TIME_ONLY');
  });

  it('TEST_S: out-of-window foreign trip contributes zero', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [
        geRow({
          id: 'foreign-oow',
          tripId: 'other-trip',
          voltageObservedAt: new Date(ANCHOR.getTime() + 60_000),
          stateObservedAt: new Date(ANCHOR.getTime() + 60_000),
        }),
      ],
    });
    expect(features.foreignTripObservationCount).toBe(0);
    expect(features.contextCompleteness).not.toContain('FOREIGN_TRIP_OBSERVATIONS_EXCLUDED');
  });

  it('TEST_W: material provenance excludes stale/foreign/future rows', () => {
    const window = confirmedWindow();
    const after = new Date(ANCHOR.getTime() + 5000);
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window,
      observations: [
        geRow({ id: 'good', sourceMeasurementId: 'meas-good' }),
        geRow({
          id: 'stale',
          sourceMeasurementId: 'meas-stale',
          evidenceClass: BatteryGeneralizedEvidenceClass.STALE_REPLAY,
        }),
        geRow({
          id: 'foreign',
          sourceMeasurementId: 'meas-foreign',
          tripId: 'other',
        }),
        geRow({
          id: 'future',
          sourceMeasurementId: 'meas-future',
          voltageObservedAt: after,
          stateObservedAt: after,
        }),
      ],
    });
    expect(features.chargeContextSourceObservationIds).toEqual(['good']);
    expect(features.chargeContextSourceMeasurementIds).toEqual(['meas-good']);
    expect(features.chargeContextSourceMeasurementIds).not.toContain('meas-stale');
  });

  it('TEST_X: rowsConsidered equals material observation provenance count', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [
        geRow({ id: 'x1' }),
        geRow({
          id: 'x2',
          stateTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.VLS_PROVIDER_FETCHED_AT,
        }),
      ],
    });
    expect(features.generalizedEvidenceRowsConsidered).toBe(
      features.chargeContextSourceObservationIds.length,
    );
    expect(features.generalizedEvidenceRowsConsidered).toBe(2);
  });

  it('PRIOR_SESSION_FEATURE_NOT_RESOLVED_IN_C2 not absence claim', () => {
    const features = computeChargeOpportunityRawFeaturesV1({
      restSessionId: SESSION,
      window: confirmedWindow(),
      observations: [],
    });
    expect(features.contextCompleteness).toContain('PRIOR_SESSION_FEATURE_NOT_RESOLVED_IN_C2');
    expect(features.contextCompleteness).not.toContain('NO_PRIOR_SESSION_FEATURE');
  });
});
