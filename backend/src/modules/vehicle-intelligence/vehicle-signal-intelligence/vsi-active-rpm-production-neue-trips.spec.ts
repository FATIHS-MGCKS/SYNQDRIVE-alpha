import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRpmEvidenceFromIntervalReplayTrips,
  resolveActiveRpmProfileV1,
} from './vsi-active-rpm-profile-resolver.util';
import {
  summarizeActiveRpmSequenceCadence,
  summarizeTripActiveIntervalCadence,
  VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS,
  VSI_ACTIVE_RPM_TRIP_ACTIVE_FAST_FRACTION_LE2_MIN,
} from './vsi-active-rpm-sequence-cadence.util';

type VerifiedTrip = {
  tripId: string;
  startMs: number;
  endMs: number;
  rpmPoints: number;
  intervalsSec: number[];
  source: string;
  exportedAt: string;
};

function loadVerifiedNeueTrips(): VerifiedTrip[] {
  const path = join(__dirname, 'fixtures/rpm-production-neue-trips-verified.json');
  return JSON.parse(readFileSync(path, 'utf8')) as VerifiedTrip[];
}

describe('vsi-active-rpm production neue Tiguan trips (verified export)', () => {
  const trips = loadVerifiedNeueTrips();

  it('fixture is production-sourced (not synthetic replay clones)', () => {
    expect(trips).toHaveLength(3);
    for (const trip of trips) {
      expect(trip.source).toBe('production_clickhouse_export');
      expect(trip.intervalsSec.length).toBeGreaterThan(10);
    }
  });

  it('29b8bb31: sustained fast active sequences → RPM_1HZ', () => {
    const trip = trips.find((t) => t.tripId.startsWith('29b8bb31'))!;
    const active = summarizeTripActiveIntervalCadence(trip.intervalsSec);
    expect(active.fractionIntervalsLe2s).toBeGreaterThanOrEqual(
      VSI_ACTIVE_RPM_TRIP_ACTIVE_FAST_FRACTION_LE2_MIN,
    );
    const seq = summarizeActiveRpmSequenceCadence(trip.intervalsSec);
    expect(seq.qualifyingFastSequenceCount).toBeGreaterThanOrEqual(1);
    const resolution = resolveActiveRpmProfileV1(
      buildRpmEvidenceFromIntervalReplayTrips([trip]),
    );
    expect(resolution?.tripClassifications[0]?.profile).toBe('RPM_1HZ');
  });

  it('0e276eb6 and f1bf4ae6: mixed fast/slow sequence evidence → UNKNOWN', () => {
    for (const prefix of ['0e276eb6', 'f1bf4ae6']) {
      const trip = trips.find((t) => t.tripId.startsWith(prefix))!;
      const seq = summarizeActiveRpmSequenceCadence(trip.intervalsSec);
      expect(seq.qualifyingFastSequenceCount).toBeGreaterThan(0);
      expect(seq.qualifyingSlowSequenceCount).toBeGreaterThan(0);
      const resolution = resolveActiveRpmProfileV1(
        buildRpmEvidenceFromIntervalReplayTrips([trip]),
      );
      expect(resolution?.tripClassifications[0]?.profile).toBe('UNKNOWN');
      expect(resolution?.tripClassifications[0]?.decisionCode).toBe(
        'MIXED_ACTIVE_CADENCE_NO_CLEAR_DOMINANCE',
      );
    }
  });

  it('documents gap break >8s on verified production intervals', () => {
    const trip = trips[0]!;
    const hasInterRunGap = trip.intervalsSec.some(
      (g) => g > VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS,
    );
    expect(hasInterRunGap).toBe(true);
    expect(VSI_ACTIVE_RPM_ACTIVE_SEQUENCE_GAP_BREAK_SECONDS).toBe(8);
  });
});
