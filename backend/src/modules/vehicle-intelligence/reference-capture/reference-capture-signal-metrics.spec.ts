import {
  ACQUISITION_SURFACES,
  analyzeSignalGroup,
  auditFingerprintSemantics,
  classifyBrakeEvidence,
  classifyMaxGap,
  classifySignalDynamics,
  computeProviderCadence,
  detectOutOfOrder,
  isBrakeCaptureEligible,
  sortByAcquisitionOrder,
  type SignalMetricsObsRow,
} from './reference-capture-signal-metrics';

function row(partial: Partial<SignalMetricsObsRow> & Pick<SignalMetricsObsRow, 'providerTimestamp'>): SignalMetricsObsRow {
  return {
    observationKind: 'SIGNAL_POINT',
    providerField: 'speed',
    acquisitionSurface: 'HF_HISTORICAL',
    synqReceivedAt: partial.providerTimestamp ?? '2026-01-01T00:00:00.000Z',
    requestStartedAt: partial.providerTimestamp ?? '2026-01-01T00:00:00.000Z',
    requestCompletedAt: partial.providerTimestamp ?? '2026-01-01T00:00:00.000Z',
    sequenceNumber: partial.sequenceNumber ?? 1,
    physicalSampleFingerprint: null,
    rawValueJson: { value: 1 },
    createdAt: partial.providerTimestamp ?? '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('reference-capture-signal-metrics', () => {
  it('detects out-of-order provider timestamps in acquisition order (1,3,2)', () => {
    const rows = [
      row({ sequenceNumber: 1, providerTimestamp: '2026-01-01T00:00:01.000Z' }),
      row({ sequenceNumber: 2, providerTimestamp: '2026-01-01T00:00:03.000Z' }),
      row({ sequenceNumber: 3, providerTimestamp: '2026-01-01T00:00:02.000Z' }),
    ];
    const result = detectOutOfOrder(rows);
    expect(result.outOfOrderCount).toBeGreaterThan(0);
    expect(result.negativeTimestampJumps).toBeGreaterThan(0);
    expect(result.largestBackwardsJumpSeconds).toBe(1);
  });

  it('uses unique provider timestamps for cadence (1,1,2,2,4 => 1,2,4)', () => {
    const rows = [
      row({ providerTimestamp: '2026-01-01T00:00:01.000Z', sequenceNumber: 1 }),
      row({ providerTimestamp: '2026-01-01T00:00:01.000Z', sequenceNumber: 2 }),
      row({ providerTimestamp: '2026-01-01T00:00:02.000Z', sequenceNumber: 3 }),
      row({ providerTimestamp: '2026-01-01T00:00:02.000Z', sequenceNumber: 4 }),
      row({ providerTimestamp: '2026-01-01T00:00:04.000Z', sequenceNumber: 5 }),
    ];
    const cadence = computeProviderCadence(rows);
    expect(cadence.uniqueProviderTimestampCount).toBe(3);
    expect(cadence.duplicateProviderTimestampRetrievals).toBe(2);
    expect(cadence.deltaTSeconds.sampleCount).toBe(2);
    expect(cadence.deltaTSeconds.min).toBe(1);
    expect(cadence.deltaTSeconds.max).toBe(2);
    expect(cadence.deltaTSeconds.p50).toBe(1);
  });

  it('keeps multi-surface analyses separate', () => {
    const hf = row({
      acquisitionSurface: 'HF_HISTORICAL',
      providerField: 'speed',
      providerTimestamp: '2026-01-01T00:00:01.000Z',
      sequenceNumber: 1,
      rawValueJson: { value: 10 },
    });
    const latest = row({
      acquisitionSurface: 'LATEST_LIVE',
      providerField: 'speed',
      providerTimestamp: '2026-01-01T00:00:01.000Z',
      sequenceNumber: 2,
      rawValueJson: { value: 20 },
    });
    const combined = analyzeSignalGroup([hf, latest]);
    const hfOnly = analyzeSignalGroup([hf]);
    const latestOnly = analyzeSignalGroup([latest]);
    expect(combined.observationCount).toBe(2);
    expect(hfOnly.observationCount).toBe(1);
    expect(latestOnly.observationCount).toBe(1);
    expect(ACQUISITION_SURFACES).toContain('HF_HISTORICAL');
    expect(ACQUISITION_SURFACES).toContain('LATEST_LIVE');
  });

  it('does not mark acceleratorPedalPosition alone as brakeCaptureEligible', () => {
    expect(isBrakeCaptureEligible(['acceleratorPedalPosition'])).toBe(false);
    expect(isBrakeCaptureEligible(['obdMAP'])).toBe(false);
    expect(isBrakeCaptureEligible(['brakePedalPosition'])).toBe(true);
    const brake = classifyBrakeEvidence(['acceleratorPedalPosition', 'obdMAP'], ['acceleratorPedalPosition']);
    expect(brake.brakeCaptureEligiblePreflight).toBe(false);
    expect(brake.brakeDirectSignalAvailable).toBe(false);
  });

  it('does not classify static non-null numeric signal as DYNAMICALLY_INFORMATIVE', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      row({
        sequenceNumber: i + 1,
        providerTimestamp: `2026-01-01T00:00:0${i + 1}.000Z`,
        rawValueJson: { value: 42 },
      }),
    );
    const dynamics = classifySignalDynamics(rows);
    expect(dynamics.nonNullCount).toBe(5);
    expect(dynamics.classification).not.toBe('DYNAMICALLY_INFORMATIVE');
    expect(['STATIC_OR_CONTEXTUAL', 'OBSERVED_NON_NULL']).toContain(dynamics.classification);
  });

  it('sorts by sequenceNumber before synqReceivedAt fallback', () => {
    const rows = sortByAcquisitionOrder([
      row({ sequenceNumber: 3, providerTimestamp: '2026-01-01T00:00:03.000Z' }),
      row({ sequenceNumber: 1, providerTimestamp: '2026-01-01T00:00:01.000Z' }),
      row({ sequenceNumber: 2, providerTimestamp: '2026-01-01T00:00:02.000Z' }),
    ]);
    expect(rows.map((r) => r.sequenceNumber)).toEqual([1, 2, 3]);
  });

  it('classifies large in-window HF gaps as PROVIDER_DATA_GAP', () => {
    const providerTimestamps = [
      Date.parse('2026-09-01T19:08:00.000Z'),
      Date.parse('2026-09-01T19:09:35.252Z'),
      Date.parse('2026-09-01T19:12:06.252Z'),
      Date.parse('2026-09-01T19:13:00.000Z'),
    ];
    const classification = classifyMaxGap({
      gapSeconds: 151,
      surface: 'HF_HISTORICAL',
      field: 'speed',
      gapIndex: 2,
      totalUniqueTimestamps: providerTimestamps.length,
      sessionStartedAtMs: Date.parse('2026-09-01T19:00:43.252Z'),
      firstAcquisitionMs: Date.parse('2026-09-01T19:12:27.239Z'),
      providerTimestamps,
    });
    expect(classification).toBe('PROVIDER_DATA_GAP');
  });

  it('documents HF_HISTORICAL fingerprints as aggregate bucket identity', () => {
    const hf = row({
      acquisitionSurface: 'HF_HISTORICAL',
      physicalSampleFingerprint: 'abc123',
      providerTimestamp: '2026-09-01T19:01:30.252Z',
      rawValueJson: 42.5,
    });
    const audit = auditFingerprintSemantics([hf]);
    expect(audit.observationTypeForHfHistorical).toBe('HF_AGGREGATE_BUCKET_OBSERVATION');
    expect(audit.uniqueAggregateBucketFingerprintsHfHistorical).toBe(1);
    expect(audit.note).toContain('aggregate buckets');
  });
});
