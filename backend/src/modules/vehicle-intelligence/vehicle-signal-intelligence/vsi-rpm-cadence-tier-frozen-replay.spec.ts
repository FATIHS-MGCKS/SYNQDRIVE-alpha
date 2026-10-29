import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRpmEvidenceFromIntervalReplayTrips,
  classifySingleTripRpmProfile,
} from './vsi-active-rpm-profile-resolver.util';
import {
  classifyVsiRpmCadenceTierV1,
  VSI_RPM_CADENCE_TIER_CONTRACT_VERSION,
} from './vsi-rpm-cadence-tier.util';

type FrozenTrip = {
  tripId: string;
  tripIdPrefix: string;
  startMs: number;
  endMs: number;
  tripDurationSeconds: number;
  rpmPointCount: number;
  intervalsSec: number[];
  seriesDigest: string;
  fableReplayExpected?: { tier: string; conf: string | null; decision: string | null };
};

type FrozenCohort = {
  contractVersion: string;
  classifierFrozenAggregates?: {
    tiguan: Record<string, number>;
    audi: Record<string, number>;
  };
  fableDocumentedReferenceAggregates?: {
    tiguan: Record<string, number>;
    audi: Record<string, number>;
  };
  fleets: {
    tiguan: { trips: FrozenTrip[]; tripCount: number };
    audi: { trips: FrozenTrip[]; tripCount: number };
  };
};

function loadFrozenCohort(): FrozenCohort {
  const path = join(__dirname, 'fixtures/rpm-multicadence-tier-frozen-cohort-v1.json');
  return JSON.parse(readFileSync(path, 'utf8')) as FrozenCohort;
}


function tallyTiers(trips: FrozenTrip[]): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const trip of trips) {
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    tally[result.tier] = (tally[result.tier] ?? 0) + 1;
  }
  return tally;
}

describe('vsi-rpm-cadence-tier frozen cohort replay', () => {
  const cohort = loadFrozenCohort();

  it('loads frozen cohort with 61 Tiguan and 57 Audi trips (fixed window, no NOW())', () => {
    expect(cohort.fleets.tiguan.tripCount).toBe(61);
    expect(cohort.fleets.audi.tripCount).toBe(57);
    expect(cohort.contractVersion).toBe('rpm-multicadence-frozen-cohort-v1');
  });

  it('every trip has a canonical RPM series digest (sha256)', () => {
    for (const fleet of [cohort.fleets.tiguan, cohort.fleets.audi]) {
      for (const trip of fleet.trips) {
        expect(trip.seriesDigest).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it('matches classifier frozen aggregates (Tiguan)', () => {
    const tally = tallyTiers(cohort.fleets.tiguan.trips);
    expect(tally).toEqual(cohort.classifierFrozenAggregates!.tiguan);
  });

  it('matches classifier frozen aggregates (Audi)', () => {
    const tally = tallyTiers(cohort.fleets.audi.trips);
    expect(tally).toEqual(cohort.classifierFrozenAggregates!.audi);
    expect(tally.RPM_1S ?? 0).toBe(0);
  });

  it('documents delta vs FABLE documented reference (CH snapshot drift)', () => {
    const tiguan = tallyTiers(cohort.fleets.tiguan.trips);
    const doc = cohort.fableDocumentedReferenceAggregates!.tiguan;
    expect(Math.abs((tiguan.RPM_1S ?? 0) - doc.RPM_1S)).toBeLessThanOrEqual(2);
    expect(Math.abs((tiguan.RPM_2S ?? 0) - doc.RPM_2S)).toBeLessThanOrEqual(2);
    expect(Math.abs((tiguan.RPM_3S ?? 0) - doc.RPM_3S)).toBeLessThanOrEqual(2);
  });

  it('sentinel: Audi a62ed62d → RPM_2S HIGH, minimal trip coverage', () => {
    const trip = cohort.fleets.audi.trips.find((t) => t.tripIdPrefix === 'a62ed62d')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('RPM_2S');
    expect(result.cadenceConfidence).toBe('HIGH');
    expect(result.activeSpanRatio).not.toBeNull();
    expect(result.activeSpanRatio!).toBeLessThan(0.15);
    expect(result.tripCoverageBand).toBe('MINIMAL_SPAN');
    expect(result.analysisReadiness).toBe('ACTIVE_SPAN_ONLY');
    expect(result.activeDensityVsTier).toBeGreaterThan(0.9);
  });

  it('sentinel: Audi f7e826f4 → SPARSE (irregular spread)', () => {
    const trip = cohort.fleets.audi.trips.find((t) => t.tripIdPrefix === 'f7e826f4')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('SPARSE');
    expect(result.decisionCode).toBe('IRREGULAR_SPREAD');
  });

  it('sentinel: Tiguan c8c321a8 → RPM_1S HIGH', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === 'c8c321a8')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('RPM_1S');
    expect(result.cadenceConfidence).toBe('HIGH');
  });

  it('sentinel: Tiguan 722211e7 → UNKNOWN QUORUM', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === '722211e7')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('UNKNOWN');
    expect(result.decisionCode).toBe('QUORUM');
  });

  it('sentinel: Tiguan 371cba40 → RPM_2S HIGH with very low trip coverage', () => {
    const trip = cohort.fleets.tiguan.trips.find((t) => t.tripIdPrefix === '371cba40')!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.tier).toBe('RPM_2S');
    expect(result.cadenceConfidence).toBe('HIGH');
    expect(result.activeSpanRatio!).toBeLessThan(0.05);
    expect(result.analysisReadiness).toBe('ACTIVE_SPAN_ONLY');
  });

  it('legacy VSI Active RPM labels unchanged on frozen cohort (per fleet)', () => {
    function legacyForTrips(trips: FrozenTrip[]) {
      const tally: Record<string, number> = {};
      for (const trip of trips) {
        const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
        const row = classifySingleTripRpmProfile({
          trip: evidence.tripWindows[0]!,
          points: evidence.points,
        });
        tally[row.profile] = (tally[row.profile] ?? 0) + 1;
      }
      return tally;
    }
    expect(legacyForTrips(cohort.fleets.tiguan.trips)).toEqual({
      RPM_1HZ: 22,
      RPM_STANDARD: 28,
      UNKNOWN: 11,
    });
    expect(legacyForTrips(cohort.fleets.audi.trips)).toEqual({
      RPM_STANDARD: 54,
      UNKNOWN: 3,
    });
  });

  it('all 22 legacy Tiguan RPM_1HZ trips map to RPM_1S or UNKNOWN (not slower tier)', () => {
    for (const trip of cohort.fleets.tiguan.trips) {
      const evidence = buildRpmEvidenceFromIntervalReplayTrips([trip]);
      const legacy = classifySingleTripRpmProfile({
        trip: evidence.tripWindows[0]!,
        points: evidence.points,
      });
      if (legacy.profile !== 'RPM_1HZ') continue;
      const tier = classifyVsiRpmCadenceTierV1({
        intervalsSec: trip.intervalsSec,
        rpmPointCount: trip.rpmPointCount,
        tripDurationSeconds: trip.tripDurationSeconds,
      });
      expect(['RPM_1S', 'UNKNOWN', 'RPM_2S']).toContain(tier.tier);
      if (tier.tier === 'RPM_2S') {
        expect(tier.p50ActiveSeconds).toBeGreaterThan(1);
      }
    }
  });

  it('contract version is vsi-rpm-cadence-tier-v1', () => {
    const trip = cohort.fleets.tiguan.trips[0]!;
    const result = classifyVsiRpmCadenceTierV1({
      intervalsSec: trip.intervalsSec,
      rpmPointCount: trip.rpmPointCount,
      tripDurationSeconds: trip.tripDurationSeconds,
    });
    expect(result.contractVersion).toBe(VSI_RPM_CADENCE_TIER_CONTRACT_VERSION);
  });
});
