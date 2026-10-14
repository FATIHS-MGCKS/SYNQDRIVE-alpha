import * as fs from 'fs';
import * as path from 'path';
import {
  evaluateM3_3HvH4AddedEnergyCounterOfflineV1,
  M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1,
} from './m3-3-hv-h4-added-energy-counter-offline-evaluator.v1';

const fixture = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'fixtures', 'r15-dimo-added-energy-interval.v1.fixture.json'),
    'utf8',
  ),
) as {
  signal: { id: string; bucketWidth: string; aggregationSemantics: string };
  episodes: Array<{
    id: string;
    hvEnergyAddedKwh: number;
    providerChargeInterval: { from: string; to: string };
    buckets: Array<{
      timestamp: string;
      addedKwhLast: number | null;
      addedKwhMin: number | null;
      addedKwhMax: number | null;
    }>;
  }>;
};

describe('evaluateM3_3HvH4AddedEnergyCounterOfflineV1', () => {
  it('evaluates a valid monotonic in-episode sequence', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'powertrainTractionBatteryChargingAddedEnergy',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:03:00Z',
      observations: [
        { timestamp: '2026-01-01T09:59:00Z', valueKwh: 0 },
        { timestamp: '2026-01-01T10:00:00Z', valueKwh: 0.1 },
        { timestamp: '2026-01-01T10:01:00Z', valueKwh: 1.1 },
        { timestamp: '2026-01-01T10:02:00Z', valueKwh: 2.0 },
        { timestamp: '2026-01-01T10:03:00Z', valueKwh: 2.5 },
      ],
    });
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.COUNTER_OBSERVATIONS_AVAILABLE,
    );
    expect(result.candidateDeltaFromFirstLastKwh).toBeCloseTo(2.4, 6);
    expect(result.candidateDeltaFromPreBaselineKwh).toBeCloseTo(2.5, 6);
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED,
    );
  });

  it('flags missing pre-charge baseline when required', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'x',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:01:00Z',
      requirePreEpisodeBaseline: true,
      observations: [{ timestamp: '2026-01-01T10:00:00Z', valueKwh: 1 }],
    });
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.INSUFFICIENT_BOUNDARY_COVERAGE,
    );
  });

  it('flags counter reset / discontinuity', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'x',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:02:00Z',
      observations: [
        { timestamp: '2026-01-01T09:59:00Z', valueKwh: 0 },
        { timestamp: '2026-01-01T10:00:00Z', valueKwh: 3 },
        { timestamp: '2026-01-01T10:01:00Z', valueKwh: 0.2 },
        { timestamp: '2026-01-01T10:02:00Z', valueKwh: 1 },
      ],
    });
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.RESET_OR_DISCONTINUITY,
    );
  });

  it('rejects conflicting duplicate timestamps', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'x',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:00:00Z',
      observations: [
        { timestamp: '2026-01-01T10:00:00Z', valueKwh: 1 },
        { timestamp: '2026-01-01T10:00:00Z', valueKwh: 2 },
      ],
    });
    expect(result.conflictingDuplicateCount).toBe(1);
    expect(result.inEpisodeObservationCount).toBe(0);
  });

  it('flags ambiguous intra-bucket min/max spread', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'x',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:00:00Z',
      observations: [
        {
          timestamp: '2026-01-01T09:59:00Z',
          valueKwh: 0,
          minKwh: 0,
          maxKwh: 0,
        },
        {
          timestamp: '2026-01-01T10:00:00Z',
          valueKwh: 2,
          minKwh: 0.5,
          maxKwh: 2.5,
        },
      ],
    });
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.AMBIGUOUS_AGGREGATION,
    );
  });

  it('rejects non-finite readings', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'x',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:00:00Z',
      observations: [
        { timestamp: '2026-01-01T09:59:00Z', valueKwh: 0 },
        { timestamp: '2026-01-01T10:00:00Z', valueKwh: Number.NaN },
      ],
    });
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.SCIENTIFIC_AUTHORITY_NOT_ESTABLISHED,
    );
  });

  it('flags missing post-charge observation when required', () => {
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: 'x',
      unit: 'kWh',
      bucketWidth: '1m',
      aggregation: 'LAST',
      aggregationSemantics: 'test',
      episodeStartInclusive: '2026-01-01T10:00:00Z',
      episodeEndInclusive: '2026-01-01T10:01:00Z',
      requirePostEpisodeObservation: true,
      observations: [
        { timestamp: '2026-01-01T09:59:00Z', valueKwh: 0 },
        { timestamp: '2026-01-01T10:00:00Z', valueKwh: 1 },
        { timestamp: '2026-01-01T10:01:00Z', valueKwh: 2 },
      ],
    });
    expect(result.labels).toContain(
      M3_3_HV_H4_ADDED_ENERGY_COUNTER_OFFLINE_LABELS_V1.INSUFFICIENT_BOUNDARY_COVERAGE,
    );
  });

  it('distinguishes absolute endpoint from first-last delta on R15 Oct13 fixture', () => {
    const ep = fixture.episodes.find((e) => e.id === 'oct13_session_795c7dcb');
    expect(ep).toBeDefined();
    const observations = ep!.buckets.map((b) => ({
      timestamp: b.timestamp,
      valueKwh: b.addedKwhLast,
      minKwh: b.addedKwhMin,
      maxKwh: b.addedKwhMax,
    }));
    const result = evaluateM3_3HvH4AddedEnergyCounterOfflineV1({
      signalId: fixture.signal.id,
      unit: 'kWh',
      bucketWidth: fixture.signal.bucketWidth,
      aggregation: 'LAST',
      aggregationSemantics: fixture.signal.aggregationSemantics,
      episodeStartInclusive: ep!.providerChargeInterval.from,
      episodeEndInclusive: ep!.providerChargeInterval.to,
      observations,
    });
    expect(result.absoluteLastInEpisodeKwh).toBeCloseTo(8.64, 2);
    expect(result.candidateDeltaFromFirstLastKwh).toBeCloseTo(8.6, 1);
    expect(result.candidateDeltaFromPreBaselineKwh).toBeCloseTo(8.64, 2);
    expect(ep!.hvEnergyAddedKwh).toBeCloseTo(5.14, 2);
  });
});
