import { describe, expect, it } from 'vitest';
import { resolveDrivingImpactQualityHintKey } from './driving-impact-quality';
import { resolveDrivingStressScore } from './scoreFormat';

describe('resolveDrivingStressScore provenance', () => {
  it('preserves numeric trip_driving_impact score', () => {
    expect(
      resolveDrivingStressScore({
        drivingStressScore: 72,
        scoreSource: 'trip_driving_impact',
        drivingImpactAnalysisStatus: 'PARTIAL',
      } as any),
    ).toBe(72);
  });

  it('does not fall back to drivingScore under R1 temporal containment', () => {
    expect(
      resolveDrivingStressScore({
        drivingStressScore: null,
        drivingScore: 88,
        scoreSource: 'r1_temporal_containment_unavailable',
      }),
    ).toBeNull();
  });

  it('allows vehicle_trip_compat legacy mirror', () => {
    expect(
      resolveDrivingStressScore({
        drivingStressScore: 55,
        scoreSource: 'vehicle_trip_compat',
      }),
    ).toBe(55);
  });

  it('supports older payloads without scoreSource', () => {
    expect(resolveDrivingStressScore({ drivingScore: 33 })).toBe(33);
  });
});

describe('resolveDrivingImpactQualityHintKey', () => {
  it('maps PARTIAL and STALE statuses', () => {
    expect(
      resolveDrivingImpactQualityHintKey({
        drivingStressScore: 50,
        drivingImpactAnalysisStatus: 'PARTIAL',
        scoreSource: 'trip_driving_impact',
      }),
    ).toBe('partial');
    expect(
      resolveDrivingImpactQualityHintKey({
        drivingStressScore: 50,
        drivingImpactAnalysisStatus: 'STALE',
        scoreSource: 'trip_driving_impact',
      }),
    ).toBe('stale');
  });
});
