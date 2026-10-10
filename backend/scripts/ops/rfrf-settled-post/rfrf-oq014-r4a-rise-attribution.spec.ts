import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-detector.config';
import { normalizeRawFuelSamples } from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-normalizer';
import {
  detectChannelRises,
  type DetectedRiseDraft,
} from '../../../src/modules/vehicle-intelligence/energy-events/raw-fuel-rise-detector/raw-fuel-rise-state-machine';
import { KS_MS_661_2026_09_30_NATURAL_SAMPLES } from './settled-post-replay.fixtures';
import { resolveCanonicalEventAnchors } from './rfrf-oq014-r4a-canonical-event-anchors.lib';
import { attributeChannelRiseToCanonicalEvent } from './rfrf-oq014-r4a-rise-attribution.lib';

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
  it('attributes KS MS 661 when independent pack anchor lies inside the rise', () => {
    const packRow = {
      id: 'KS_MS_661_2026_09_30',
      kind: 'NATURAL' as const,
      label: 'KS MS 661',
      vehicle: 'KS MS 661',
      eventTimestamp: '2026-09-30T04:57:00.000Z',
      replayEvidenceTier: 'CRITICAL_PATH_FULL_REPLAY' as const,
      window: { from: '2026-09-30T04:35:00.000Z', to: '2026-09-30T11:30:00.000Z' },
      samples: KS_MS_661_2026_09_30_NATURAL_SAMPLES,
      groundTruthLiters: 12,
      relativeCorroboration: 'NO' as const,
    };
    const norm = normalizeRawFuelSamples(
      packRow.samples,
      new Date(packRow.window.from),
      new Date(packRow.window.to),
      RAW_FUEL_RISE_DETECTOR_CONFIG_V1.relativeValidRange,
    );
    if (!norm.ok) throw new Error(`normalize failed: ${norm.detail}`);
    const rises = detectChannelRises(norm.samples, 'ABSOLUTE_LITERS', RAW_FUEL_RISE_DETECTOR_CONFIG_V1);
    const anchors = resolveCanonicalEventAnchors(packRow.id, packRow, null);
    const attribution = attributeChannelRiseToCanonicalEvent(rises, anchors);
    expect(attribution.status).toBe('ATTRIBUTED');
  });

  it('fails closed on UNVERIFIED_EVENT_ANCHOR without independent timestamp', () => {
    const anchors = resolveCanonicalEventAnchors('WOB_7503_2026_09_15', null, {
      refuelRiseStartUtc: null,
      provenance: 'UNVERIFIED_NO_INDEPENDENT_ANCHOR',
    });
    const rises = [
      syntheticRise('2026-09-15T09:10:00.000Z', '2026-09-15T09:20:00.000Z', 21),
    ];
    expect(attributeChannelRiseToCanonicalEvent(rises, anchors).status).toBe('UNVERIFIED_EVENT_ANCHOR');
  });

  it('blocks unbounded nearest-rise when anchor is verified but not inside any rise', () => {
    const anchors = resolveCanonicalEventAnchors('SYNTHETIC', null, {
      refuelRiseStartUtc: '2026-01-11T00:03:00.000Z',
      provenance: 'PRODUCTION_FORENSIC_PHYSICAL_EPISODE_TEST',
    });
    anchors.queryWindowFromUtc = '2026-01-11T00:00:00.000Z';
    anchors.queryWindowToUtc = '2026-01-11T00:15:00.000Z';
    const rises = [
      syntheticRise('2026-01-11T00:10:00.000Z', '2026-01-11T00:12:00.000Z', 40),
    ];
    expect(attributeChannelRiseToCanonicalEvent(rises, anchors).status).toBe(
      'ANCHOR_NOT_CONTAINED_IN_RISE',
    );
  });

  it('marks multiple rises containing the same canonical timestamp as AMBIGUOUS', () => {
    const anchors = resolveCanonicalEventAnchors('SYNTHETIC', null, {
      refuelRiseStartUtc: '2026-01-11T00:03:00.000Z',
      provenance: 'PRODUCTION_FORENSIC_PHYSICAL_EPISODE_TEST',
    });
    anchors.queryWindowFromUtc = '2026-01-11T00:00:00.000Z';
    anchors.queryWindowToUtc = '2026-01-11T00:15:00.000Z';
    const rises = [
      syntheticRise('2026-01-11T00:02:00.000Z', '2026-01-11T00:04:00.000Z', 20),
      syntheticRise('2026-01-11T00:02:30.000Z', '2026-01-11T00:04:30.000Z', 22),
    ];
    expect(attributeChannelRiseToCanonicalEvent(rises, anchors).status).toBe('AMBIGUOUS');
  });

  it('does not attribute the tallest rise when the verified anchor lies on a smaller rise', () => {
    const anchors = resolveCanonicalEventAnchors('SYNTHETIC', null, {
      refuelRiseStartUtc: '2026-01-11T00:03:00.000Z',
      provenance: 'PRODUCTION_FORENSIC_PHYSICAL_EPISODE_TEST',
    });
    anchors.queryWindowFromUtc = '2026-01-11T00:00:00.000Z';
    anchors.queryWindowToUtc = '2026-01-11T00:15:00.000Z';
    const rises = [
      syntheticRise('2026-01-11T00:02:00.000Z', '2026-01-11T00:04:00.000Z', 20),
      syntheticRise('2026-01-11T00:10:00.000Z', '2026-01-11T00:12:00.000Z', 40),
    ];
    const attribution = attributeChannelRiseToCanonicalEvent(rises, anchors);
    expect(attribution.status).toBe('ATTRIBUTED');
    if (attribution.status === 'ATTRIBUTED') {
      expect(Math.max(...attribution.rise.risePoints.map((p) => p.value))).toBe(20);
    }
  });
});
