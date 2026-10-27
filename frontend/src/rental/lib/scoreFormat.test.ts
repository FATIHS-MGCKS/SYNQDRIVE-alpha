import { describe, expect, it } from 'vitest';
import { resolveDrivingImpactQualityHintKeys } from './driving-impact-quality';
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

  it('returns null for explicit null trip_driving_impact without legacy mirror', () => {
    expect(
      resolveDrivingStressScore({
        drivingStressScore: null,
        drivingScore: 88,
        scoreSource: 'trip_driving_impact',
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

describe('resolveDrivingImpactQualityHintKeys', () => {
  it('maps COMPLETE / PARTIAL / STALE analysis statuses', () => {
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 50,
        drivingImpactAnalysisStatus: 'COMPLETE',
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual([]);
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 50,
        drivingImpactAnalysisStatus: 'PARTIAL',
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual(['partial']);
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 50,
        drivingImpactAnalysisStatus: 'STALE',
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual(['stale']);
  });

  it('surfaces PENDING / FAILED / UNSUPPORTED with numeric score', () => {
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 61,
        drivingImpactAnalysisStatus: 'PENDING',
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual(['pending']);
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 72,
        drivingImpactAnalysisStatus: 'FAILED',
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual(['failed']);
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 40,
        drivingImpactAnalysisStatus: 'UNSUPPORTED',
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual(['unsupported']);
  });

  it('combines legacy mirror with FAILED/UNSUPPORTED status', () => {
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 44,
        drivingImpactAnalysisStatus: 'FAILED',
        scoreSource: 'vehicle_trip_compat',
      }),
    ).toEqual(['failed', 'legacyCompat']);
  });

  it('handles missing TDI and legacy-only score', () => {
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: 44,
        drivingImpactAnalysisStatus: null,
        scoreSource: 'vehicle_trip_compat',
      }),
    ).toEqual(['legacyCompat']);
  });

  it('handles R1 containment and unavailable score', () => {
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: null,
        scoreSource: 'r1_temporal_containment_unavailable',
      }),
    ).toEqual(['r1Contained']);
    expect(
      resolveDrivingImpactQualityHintKeys({
        drivingStressScore: null,
        scoreSource: 'trip_driving_impact',
      }),
    ).toEqual(['unavailable']);
  });
});
