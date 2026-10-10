import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { normalizeRawFuelSamples } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer';
import {
  detectChannelRises,
  type DetectedRiseDraft,
} from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import { KS_MS_661_2026_09_30_NATURAL_SAMPLES } from './settled-post-replay.fixtures';
import { attributeChannelRiseToCanonicalEvent } from './rfrf-oq014-r4a-rise-attribution.lib';

function s(iso: string, liters: number) {
  return { timestamp: new Date(iso), absoluteLiters: liters, relativePercent: null };
}

function syntheticRise(onsetIso: string, endIso: string, peakLiters: number): DetectedRiseDraft {
  const onset = new Date(onsetIso);
  const end = new Date(endIso);
  const point = {
    timestamp: end,
    value: peakLiters,
    source: {} as DetectedRiseDraft['risePoints'][number]['source'],
  };
  return {
    channel: 'ABSOLUTE_LITERS',
    prePlateau: { startIdx: 0, endIdx: 0, median: 8, samples: [point] },
    risePoints: [point],
    postPlateau: null,
    riseOnsetAt: onset,
    riseEndAt: end,
    lifecycleState: 'READY_FOR_PERSIST',
    rejectionReason: null,
    maxSampleGapSeconds: 0,
    sensorResetSuspected: false,
    returnedToBaselineBeforePost: false,
    baselineRecencyReason: null,
    baselineRecencyMeta: {},
  };
}

describe('R4A rise attribution (offline)', () => {
  it('attributes KS MS 661 canonical natural refuel via event timestamp (not peak heuristic)', () => {
    const norm = normalizeRawFuelSamples(
      KS_MS_661_2026_09_30_NATURAL_SAMPLES,
      new Date('2026-09-30T04:35:00.000Z'),
      new Date('2026-09-30T11:30:00.000Z'),
      RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
    );
    if (!norm.ok) throw new Error(`normalize failed: ${norm.detail}`);
    const rises = detectChannelRises(norm.samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
    expect(rises.length).toBeGreaterThan(0);

    const attribution = attributeChannelRiseToCanonicalEvent(rises, {
      eventId: 'KS_MS_661_2026_09_30',
      eventTimestamp: new Date('2026-09-30T04:57:00.000Z'),
      episodeWindowFrom: new Date('2026-09-30T04:35:00.000Z'),
      episodeWindowTo: new Date('2026-09-30T11:30:00.000Z'),
    });
    expect(attribution.status).toBe('ATTRIBUTED');
  });

  it('fails closed when two physical refuels share a source window (T21-class separation)', () => {
    const synthetic = [
      syntheticRise('2026-09-30T05:00:00.000Z', '2026-09-30T05:08:00.000Z', 20),
      syntheticRise('2026-09-30T05:12:00.000Z', '2026-09-30T05:18:00.000Z', 27),
    ];
    const syntheticAmbiguous = attributeChannelRiseToCanonicalEvent(synthetic, {
      eventId: 'SYNTHETIC_BETWEEN_REFUELS',
      eventTimestamp: new Date('2026-09-30T05:10:00.000Z'),
      episodeWindowFrom: new Date('2026-09-30T04:55:00.000Z'),
      episodeWindowTo: new Date('2026-09-30T05:30:00.000Z'),
    });
    expect(syntheticAmbiguous.status).toBe('AMBIGUOUS');
  });

  it('does not attribute the tallest rise when the event anchor lies on a smaller rise', () => {
    const rises = [
      syntheticRise('2026-01-11T00:02:00.000Z', '2026-01-11T00:04:00.000Z', 20),
      syntheticRise('2026-01-11T00:10:00.000Z', '2026-01-11T00:12:00.000Z', 40),
    ];
    const attribution = attributeChannelRiseToCanonicalEvent(rises, {
      eventId: 'CANONICAL_SMALLER_RISE',
      eventTimestamp: new Date('2026-01-11T00:03:00.000Z'),
      episodeWindowFrom: new Date('2026-01-11T00:00:00.000Z'),
      episodeWindowTo: new Date('2026-01-11T00:15:00.000Z'),
    });
    expect(attribution.status).toBe('ATTRIBUTED');
    if (attribution.status === 'ATTRIBUTED') {
      expect(Math.max(...attribution.rise.risePoints.map((p) => p.value))).toBe(20);
    }
  });
});
