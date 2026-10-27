import {
  splitIntervalsIntoActiveMeasurementSequences,
  summarizeActiveRpmSequenceCadence,
  tripActiveCadenceSupportsFastProfile,
} from './vsi-active-rpm-sequence-cadence.util';

describe('vsi-active-rpm-sequence-cadence', () => {
  it('splits on gaps strictly above 8 s', () => {
    const sequences = splitIntervalsIntoActiveMeasurementSequences([
      1, 1, 20, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(sequences).toHaveLength(2);
    expect(sequences[0]).toEqual([1, 1]);
    expect(sequences[1]?.length).toBe(9);
  });

  it('detects qualifying fast sequences independent of trip-level P95', () => {
    const intervals = [
      ...Array.from({ length: 12 }, () => 1),
      30,
      ...Array.from({ length: 12 }, () => 1),
    ];
    const summary = summarizeActiveRpmSequenceCadence(intervals);
    expect(summary.qualifyingFastSequenceCount).toBeGreaterThanOrEqual(2);
    expect(tripActiveCadenceSupportsFastProfile(intervals)).toBe(true);
  });
});
