import {
  buildRollingWindowManifest,
  distanceWeightedAverage,
  distanceWeightedBrakingProxyShare,
  isRollingModelVersionCompatible,
  mergeRollingSourceQuality,
  resolveRollingHealthEligibility,
  selectRollingCohort,
  sortRollingTripRows,
  toRollingTripRow,
} from './driving-impact-rolling';
import type { RollingTripRow } from './driving-impact-rolling.types';
import { DRIVING_IMPACT_MODEL_PROFILE_VERSION } from '../driving-impact-model-profile/driving-impact-model-profile.types';
import { readTripDrivingImpactModelProfile } from '../driving-impact-model-profile/driving-impact-model-profile.reader';

function makeRow(overrides: Partial<RollingTripRow> & Pick<RollingTripRow, 'tripId'>): RollingTripRow {
  return {
    tripId: overrides.tripId,
    distanceKm: overrides.distanceKm ?? 50,
    tripStartedAt: overrides.tripStartedAt ?? new Date('2026-03-01T08:00:00Z'),
    tripEndedAt: overrides.tripEndedAt ?? new Date('2026-03-01T09:00:00Z'),
    drivingStressScore: overrides.drivingStressScore ?? 40,
    modelVersion: overrides.modelVersion ?? 'v1.2.0',
    sourceSummaryJson: overrides.sourceSummaryJson ?? {
      modelProfile: {
        version: DRIVING_IMPACT_MODEL_PROFILE_VERSION,
        profile: 'LTE_R1_NATIVE',
        comparabilityGroup: 'NATIVE_LTE',
        behavioralIngestionPath: 'TELEMETRY_EVENTS',
        crossFleetComparableProfiles: ['LTE_R1_NATIVE', 'ICE_SIGNAL_CONTEXT'],
      },
    },
  };
}

describe('selectRollingCohort', () => {
  it('excludes trips with mismatched model versions', () => {
    const selection = selectRollingCohort(
      [
        makeRow({ tripId: 't1', modelVersion: 'v1.2.0', distanceKm: 80 }),
        makeRow({ tripId: 't2', modelVersion: 'v1.1.0', distanceKm: 20 }),
      ],
      'v1.2.0',
    );

    expect(selection.included).toHaveLength(1);
    expect(selection.included[0].tripId).toBe('t1');
    expect(selection.excluded).toHaveLength(1);
    expect(selection.excluded[0].reason).toBe('MODEL_VERSION_MISMATCH');
    expect(selection.mixPolicy).toBe('MODEL_CHANGE_RESET');
  });

  it('partitions incompatible model profiles by largest distance cohort', () => {
    const selection = selectRollingCohort(
      [
        makeRow({
          tripId: 'lte-1',
          distanceKm: 120,
          sourceSummaryJson: {
            modelProfile: {
              version: DRIVING_IMPACT_MODEL_PROFILE_VERSION,
              profile: 'LTE_R1_NATIVE',
              comparabilityGroup: 'NATIVE_LTE',
              behavioralIngestionPath: 'TELEMETRY_EVENTS',
            },
          },
        }),
        makeRow({
          tripId: 'smart5-1',
          distanceKm: 30,
          sourceSummaryJson: {
            modelProfile: {
              version: DRIVING_IMPACT_MODEL_PROFILE_VERSION,
              profile: 'SMART5_LIMITED',
              comparabilityGroup: 'HF_LIMITED',
              behavioralIngestionPath: 'HF_DERIVED',
            },
          },
        }),
      ],
      'v1.2.0',
    );

    expect(selection.included.map((row) => row.tripId)).toEqual(['lte-1']);
    expect(selection.excluded[0].reason).toBe('PROFILE_INCOMPATIBLE');
    expect(selection.mixPolicy).toBe('PROFILE_PARTITION');
  });

  it('is deterministic for identical input ordering', () => {
    const rows = [
      makeRow({ tripId: 'b', tripStartedAt: new Date('2026-03-02T08:00:00Z') }),
      makeRow({ tripId: 'a', tripStartedAt: new Date('2026-03-01T08:00:00Z') }),
    ];
    const first = selectRollingCohort(rows, 'v1.2.0');
    const second = selectRollingCohort(rows, 'v1.2.0');
    expect(first.included.map((row) => row.tripId)).toEqual(
      second.included.map((row) => row.tripId),
    );
  });
});

describe('distance-weighted aggregates', () => {
  it('weights proxy share by distance', () => {
    const share = distanceWeightedBrakingProxyShare([
      {
        distanceKm: 80,
        sourceSummaryJson: { brakingProvenance: { proxyKinematicShare: 0.2 } },
      },
      {
        distanceKm: 20,
        sourceSummaryJson: { brakingProvenance: { proxyKinematicShare: 0.8 } },
      },
    ]);
    expect(share).toBe(0.32);
  });

  it('builds manifest with visible window metadata', () => {
    const rows = sortRollingTripRows([
      makeRow({ tripId: 't1', distanceKm: 60, drivingStressScore: 30 }),
      makeRow({ tripId: 't2', distanceKm: 40, drivingStressScore: 50 }),
    ]);
    const selection = selectRollingCohort(rows, 'v1.2.0');
    const manifest = buildRollingWindowManifest({
      windowDays: 30,
      targetModelVersion: 'v1.2.0',
      selection,
      provenanceRows: [],
      sourceQuality: {
        measuredShare: 0,
        providerClassifiedShare: 1,
        reconstructedShare: 0,
        estimatedProxyShare: 0,
        contextOnlyShare: 0,
        measurementCoverage: 0.9,
      },
      proxyShare: {
        estimatedProxyShare: 0,
        brakingProxyKinematicShare: 0.1,
      },
      healthEligibility: 'HIGH',
    });

    expect(manifest.tripCount).toBe(2);
    expect(manifest.scoredTripCount).toBe(2);
    expect(manifest.distanceKmWindow).toBe(100);
    expect(manifest.notDriverEvaluation).toBe(true);
    expect(manifest.recomputeDeterministic).toBe(true);
    expect(distanceWeightedAverage(selection.included, (row) => row.drivingStressScore)).toBe(38);
  });
});

describe('isRollingModelVersionCompatible', () => {
  it('requires exact model version match', () => {
    expect(isRollingModelVersionCompatible('v1.2.0', 'v1.2.0')).toBe(true);
    expect(isRollingModelVersionCompatible('v1.1.0', 'v1.2.0')).toBe(false);
  });
});

describe('toRollingTripRow', () => {
  it('reads model profile from source summary', () => {
    const row = toRollingTripRow({
      tripId: 'trip-1',
      distanceKm: 10,
      tripStartedAt: new Date(),
      tripEndedAt: new Date(),
      drivingStressScore: 12,
      modelVersion: 'v1.2.0',
      sourceSummaryJson: {
        modelProfile: {
          version: DRIVING_IMPACT_MODEL_PROFILE_VERSION,
          profile: 'SMART5_LIMITED',
          comparabilityGroup: 'HF_LIMITED',
          behavioralIngestionPath: 'HF_DERIVED',
        },
      },
    } as any);
    const profile = readTripDrivingImpactModelProfile(row.sourceSummaryJson);
    expect(profile?.profile).toBe('SMART5_LIMITED');
  });
});
