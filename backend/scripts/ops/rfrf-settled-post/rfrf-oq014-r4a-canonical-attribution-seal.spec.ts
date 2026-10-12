import {
  computeAllR4aEligibleMetrics,
  isAuthoritativeCalibrationMetric,
  KS_MS_661_CANONICAL_CALIBRATION_EVENT_ID,
  summarizeDropCalibration,
} from './rfrf-oq014-r4a-calibration-metrics.lib';
import { NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS } from './rfrf-oq014-r4a-event-accounting';
import { resolveCanonicalEventAnchors } from './rfrf-oq014-r4a-canonical-event-anchors.lib';

describe('R4A canonical event attribution seal', () => {
  it('separates first sample from canonical refuel timestamp for WOB spine', () => {
    const anchors = resolveCanonicalEventAnchors('WOB_7503_2026_09_15', null, {
      refuelRiseStartUtc: null,
      provenance: 'UNVERIFIED_NO_INDEPENDENT_ANCHOR',
    });
    expect(anchors.firstSampleTimestampUtc).toBeNull();
    expect(anchors.canonicalRefuelTimestampUtc).toBeNull();
    expect(anchors.canonicalRefuelTimestampProvenance).toBe('UNVERIFIED');
  });

  it('reconciles population N=6 vs authoritative metric N', () => {
    const metrics = computeAllR4aEligibleMetrics();
    expect(metrics.length).toBe(NATURAL_CALIBRATION_ELIGIBLE_EVENT_IDS.length);
    const authoritative = metrics.filter(isAuthoritativeCalibrationMetric);
    expect(authoritative.length).toBeLessThan(metrics.length);
    const wob915 = metrics.find((m) => m.eventId === 'WOB_7503_2026_09_15')!;
    expect(wob915.riseAttributionStatus).toBe('UNVERIFIED_EVENT_ANCHOR');
    expect(wob915.authoritativeCalibrationMetricEligible).toBe(false);
    expect(wob915.dropCalibrationPopulationEligible).toBe(true);
  });

  it('preserves KS MS 661 canonical calibration event identity', () => {
    const ks661 = computeAllR4aEligibleMetrics().find(
      (m) => m.eventId === KS_MS_661_CANONICAL_CALIBRATION_EVENT_ID,
    )!;
    expect(ks661.riseAttributionStatus).toBe('ATTRIBUTED');
    expect(ks661.canonicalEventAnchor.canonicalRefuelTimestampProvenance).toBe(
      'COMMITTED_DEFENSIBLE_PACK_PHYSICAL_EVENT',
    );
  });

  it('excludes non-attributed events from authoritative drop summary', () => {
    const summary = summarizeDropCalibration(computeAllR4aEligibleMetrics());
    expect(summary.populationN).toBe(6);
    expect(summary.authoritativeN).toBeLessThan(6);
    expect(summary.authoritativeN).toBeGreaterThan(0);
  });
});
