import {
  buildOrgLteR1Baseline,
  evaluateAgainstOrgBaseline,
  percentile,
} from './driving-assessment-org-baseline';
import { evaluateTripDeviceQuality } from './driving-assessment-device-quality.detector';

describe('driving-assessment-org-baseline', () => {
  it('computes median and p95 from samples', () => {
    const baseline = buildOrgLteR1Baseline([
      { eventsPerKm: 0.2, rawNativeCount: 2 },
      { eventsPerKm: 0.3, rawNativeCount: 3 },
      { eventsPerKm: 0.5, rawNativeCount: 4 },
      { eventsPerKm: 0.8, rawNativeCount: 5 },
      { eventsPerKm: 1.0, rawNativeCount: 6 },
      { eventsPerKm: 1.2, rawNativeCount: 7 },
    ]);
    expect(baseline.sufficient).toBe(true);
    expect(baseline.medianEventsPerKm).toBe(0.5);
    expect(baseline.p95EventsPerKm).toBe(1.2);
  });

  it('flags trip above org baseline with cadence pattern', () => {
    const baseline = buildOrgLteR1Baseline([
      { eventsPerKm: 0.2, rawNativeCount: 2 },
      { eventsPerKm: 0.2, rawNativeCount: 2 },
      { eventsPerKm: 0.3, rawNativeCount: 3 },
      { eventsPerKm: 0.4, rawNativeCount: 3 },
      { eventsPerKm: 0.5, rawNativeCount: 4 },
    ]);

    const reasons = evaluateAgainstOrgBaseline({
      eventsPerKm: 3.5,
      rawNativeCount: 12,
      medianInterEventGapMs: 14_000,
      durationMin: 10,
      baseline,
    });
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('integrates org baseline into trip detector', () => {
    const baseline = buildOrgLteR1Baseline([
      { eventsPerKm: 0.2, rawNativeCount: 2 },
      { eventsPerKm: 0.2, rawNativeCount: 2 },
      { eventsPerKm: 0.3, rawNativeCount: 3 },
      { eventsPerKm: 0.4, rawNativeCount: 3 },
      { eventsPerKm: 0.5, rawNativeCount: 4 },
    ]);
    const base = new Date('2026-07-08T19:40:00.000Z');
    const events = Array.from({ length: 12 }, (_, i) => ({
      eventType: 'HARSH_ACCELERATION',
      recordedAt: new Date(base.getTime() + i * 14_000),
    }));

    const verdict = evaluateTripDeviceQuality({
      events,
      distanceKm: 4,
      durationMin: 10,
      orgBaseline: baseline,
    });
    expect(verdict.flagged).toBe(true);
    expect(verdict.metrics.orgBaselineApplied).toBe(true);
  });

  it('percentile handles empty input', () => {
    expect(percentile([], 50)).toBeNull();
  });
});
