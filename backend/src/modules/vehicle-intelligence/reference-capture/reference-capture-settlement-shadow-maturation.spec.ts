import { compareBucketSets } from './reference-capture-settlement-shadow-response.parser';
import {
  priorBucketIdentitiesFromMaturationRecord,
  selectPriorMaturationObservation,
} from './reference-capture-settlement-shadow-maturation.lib';
import { EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL } from './reference-capture-exp-021-motion.lib';

const intervalStart = '2026-09-10T11:00:00.000Z';
const intervalEnd = '2026-09-10T12:00:00.000Z';
const candidateId = 'pdi-abc';

function pdiObservation(ageMs: number, buckets: string[], probeId: string) {
  return {
    probeId,
    probeType: 'WHOLE_TRIP' as const,
    phase: EXP021_PHYSICAL_DRIVE_INTERVAL_CHANNEL,
    sourceIntervalStart: intervalStart,
    sourceIntervalEnd: intervalEnd,
    scheduledAgeMs: ageMs,
    observationJson: { candidateId, uniqueBucketIdentities: buckets },
  };
}

function wholeTripObservation(ageMs: number, buckets: string[], probeId: string) {
  return {
    probeId,
    probeType: 'WHOLE_TRIP' as const,
    phase: null,
    sourceIntervalStart: intervalStart,
    sourceIntervalEnd: intervalEnd,
    scheduledAgeMs: ageMs,
    observationJson: { uniqueBucketIdentities: buckets },
  };
}

describe('reference-capture-settlement-shadow-maturation.lib', () => {
  it('PDI_CROSS_AGE_MATURATION_COMPARISON', () => {
    const prior = [
      pdiObservation(30_000, ['A', 'B'], 'PDI-30'),
      pdiObservation(60_000, ['A', 'B', 'C'], 'PDI-60'),
    ];

    const at60 = selectPriorMaturationObservation({
      current: pdiObservation(60_000, ['A', 'B', 'C'], 'PDI-60'),
      priorObservations: prior,
      pdiCandidateId: candidateId,
    });
    const cmp60 = compareBucketSets(
      ['A', 'B', 'C'],
      priorBucketIdentitiesFromMaturationRecord(at60),
    );
    expect(cmp60.newBucketIdentities).toEqual(['C']);
    expect(cmp60.missingBucketIdentities).toEqual([]);

    const at120 = selectPriorMaturationObservation({
      current: pdiObservation(120_000, ['A', 'C'], 'PDI-120'),
      priorObservations: [...prior, pdiObservation(120_000, ['A', 'C'], 'PDI-120')],
      pdiCandidateId: candidateId,
    });
    const cmp120 = compareBucketSets(
      ['A', 'C'],
      priorBucketIdentitiesFromMaturationRecord(at120),
    );
    expect(cmp120.newBucketIdentities).toEqual([]);
    expect(cmp120.missingBucketIdentities).toEqual(['B']);
  });

  it('WHOLE_TRIP_CROSS_AGE_MATURATION_COMPARISON', () => {
    const prior = [
      wholeTripObservation(30_000, ['A', 'B'], 'WT-30'),
      wholeTripObservation(60_000, ['A', 'B', 'C'], 'WT-60'),
    ];

    const at60 = selectPriorMaturationObservation({
      current: wholeTripObservation(60_000, ['A', 'B', 'C'], 'WT-60'),
      priorObservations: prior,
    });
    const cmp60 = compareBucketSets(
      ['A', 'B', 'C'],
      priorBucketIdentitiesFromMaturationRecord(at60),
    );
    expect(cmp60.newBucketIdentities).toEqual(['C']);
    expect(cmp60.missingBucketIdentities).toEqual([]);

    const at120 = selectPriorMaturationObservation({
      current: wholeTripObservation(120_000, ['A', 'C'], 'WT-120'),
      priorObservations: [...prior, wholeTripObservation(120_000, ['A', 'C'], 'WT-120')],
    });
    const cmp120 = compareBucketSets(
      ['A', 'C'],
      priorBucketIdentitiesFromMaturationRecord(at120),
    );
    expect(cmp120.newBucketIdentities).toEqual([]);
    expect(cmp120.missingBucketIdentities).toEqual(['B']);
  });

  it('FIXED_INTERVAL_MATURATION_REGRESSION', () => {
    const prior = [
      {
        probeId: 'SP-60-A',
        probeType: 'FIXED_INTERVAL' as const,
        phase: '60s',
        sourceIntervalStart: intervalStart,
        sourceIntervalEnd: intervalEnd,
        scheduledAgeMs: 30_000,
        observationJson: { uniqueBucketIdentities: ['X'] },
      },
      {
        probeId: 'SP-60-A',
        probeType: 'FIXED_INTERVAL' as const,
        phase: '60s',
        sourceIntervalStart: intervalStart,
        sourceIntervalEnd: intervalEnd,
        scheduledAgeMs: 60_000,
        observationJson: { uniqueBucketIdentities: ['X', 'Y'] },
      },
    ];

    const selected = selectPriorMaturationObservation({
      current: {
        probeId: 'SP-60-A',
        probeType: 'FIXED_INTERVAL',
        phase: '60s',
        sourceIntervalStart: intervalStart,
        sourceIntervalEnd: intervalEnd,
        scheduledAgeMs: 60_000,
        observationJson: null,
      },
      priorObservations: prior,
    });
    expect(priorBucketIdentitiesFromMaturationRecord(selected)).toEqual(['X']);

    const wrongProbe = selectPriorMaturationObservation({
      current: {
        probeId: 'SP-60-B',
        probeType: 'FIXED_INTERVAL',
        phase: '60s',
        sourceIntervalStart: intervalStart,
        sourceIntervalEnd: intervalEnd,
        scheduledAgeMs: 60_000,
        observationJson: null,
      },
      priorObservations: prior,
    });
    expect(wrongProbe).toBeNull();
  });

  it('VALUE_REVISION_DETECTED_WHEN_SNAPSHOTS_PRESENT', () => {
    const prior = {
      probeId: 'SP-60-A',
      probeType: 'FIXED_INTERVAL' as const,
      phase: '60s',
      sourceIntervalStart: intervalStart,
      sourceIntervalEnd: intervalEnd,
      scheduledAgeMs: 30_000,
      observationJson: {
        uniqueBucketIdentities: ['speed|2026-09-10T12:00:00.000Z'],
        bucketValueSnapshots: { 'speed|2026-09-10T12:00:00.000Z': '40' },
      },
    };
    const cmp = compareBucketSets(
      ['speed|2026-09-10T12:00:00.000Z'],
      prior.observationJson!.uniqueBucketIdentities!,
      {
        currentSnapshots: { 'speed|2026-09-10T12:00:00.000Z': '41' },
        priorSnapshots: prior.observationJson!.bucketValueSnapshots,
      },
    );
    expect(cmp.revisionCount).toBe(1);
    expect(cmp.valueRevisedBucketIdentities).toEqual(['speed|2026-09-10T12:00:00.000Z']);
  });
});

