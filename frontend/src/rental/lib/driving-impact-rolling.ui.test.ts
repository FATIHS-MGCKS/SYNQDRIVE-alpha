import { describe, expect, it } from 'vitest';
import { formatDrivingImpactRollingFootnote } from './driving-impact-rolling.ui';

describe('driving-impact-rolling.ui', () => {
  it('formats rolling window visibility footnote', () => {
    const text = formatDrivingImpactRollingFootnote({
      version: 'impact-rolling-v1',
      windowDays: 30,
      windowStartedAt: '2026-07-01T00:00:00.000Z',
      windowEndedAt: '2026-07-15T00:00:00.000Z',
      tripCount: 4,
      scoredTripCount: 4,
      excludedTripCount: 1,
      distanceKmWindow: 220,
      excludedDistanceKm: 15,
      modelVersion: 'v1.2.0',
      modelProfileVersion: 'impact-model-profile-v1',
      modelProfile: 'LTE_R1_NATIVE',
      mixPolicy: 'MODEL_CHANGE_RESET',
      sourceQuality: {
        measuredShare: 0,
        providerClassifiedShare: 1,
        reconstructedShare: 0,
        estimatedProxyShare: 0.2,
        contextOnlyShare: 0,
        measurementCoverage: 0.9,
      },
      proxyShare: {
        estimatedProxyShare: 0.2,
        brakingProxyKinematicShare: 0.15,
      },
      healthEligibility: 'HIGH',
      notDriverEvaluation: true,
      comparabilityHint: null,
      recomputeDeterministic: true,
    });
    expect(text).toContain('4 Trips');
    expect(text).toContain('220 km');
    expect(text).toContain('keine Fahrerbewertung');
  });
});
