import { acquireDiV0NativeEventEvidence } from '../../native-event-evidence/di-v0-native-event-acquisition';
import { FULL_R1_002_GOLDEN } from '../../position-acquisition/__tests__/fixtures/full-r1-002-golden.fixture';
import { buildRequest } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { acquireDiV0HistoricalR1Obd, toDiV0S1R1ObdInput } from '../di-v0-r1-obd-acquisition';
import {
  FULL_R1_002_S3B_DEVICE_IDENTITY,
  FULL_R1_002_S3B_PROVENANCE,
  FULL_R1_002_S3B_STRUCTURAL_R1_ROWS,
} from './fixtures/full-r1-002-s3b-structural.fixture';

describe('WOB FULL-R1-002 S3B control (bound to committed S3A golden; structural R1 rows)', () => {
  it('R1 sparse INTERVAL_ONLY over golden window; native NO_EVENT; no invented events', async () => {
    const g = FULL_R1_002_GOLDEN;
    expect(FULL_R1_002_S3B_PROVENANCE.capturedR1ObdRowsInRepo).toBe(false);
    const r1 = await acquireDiV0HistoricalR1Obd(
      buildRequest(g.fromUtc, g.toUtc, {
        organizationId: g.organizationId,
        vehicleId: g.vehicleId,
        tripId: g.tripId,
        dimoTokenId: g.dimoTokenId,
        dimoDeviceIdentity: FULL_R1_002_S3B_DEVICE_IDENTITY,
      }),
      { executeHistoricalR1ObdQuery: async () => ({ data: { signals: [...FULL_R1_002_S3B_STRUCTURAL_R1_ROWS] } }) },
    );
    expect(r1.status).toBe('ACQUIRED');
    if (r1.status !== 'ACQUIRED') return;
    expect(r1.result.sourceFamily).toBe('RUPTELA_R1');
    expect(r1.result.counters.requestedBuckets).toBe(g.expectedBucketCount);
    expect(r1.result.counters.rowPresent).toBe(FULL_R1_002_S3B_STRUCTURAL_R1_ROWS.length);
    expect(r1.result.qualityFlags).toContain('SPARSE_SIGNAL');
    expect(r1.result.buckets.every((b) => b.temporalSemantics === 'INTERVAL_ONLY')).toBe(true);
    const observations = toDiV0S1R1ObdInput(r1.result);
    expect(observations.length).toBe(FULL_R1_002_S3B_STRUCTURAL_R1_ROWS.length);

    const native = acquireDiV0NativeEventEvidence({
      context: {
        organizationId: g.organizationId,
        vehicleId: g.vehicleId,
        tripId: g.tripId,
        windowStart: g.fromUtc,
        windowEnd: g.toUtc,
        sourceFamily: 'RUPTELA_R1',
        provider: 'DIMO',
      },
      source: { kind: 'SOURCE_SUCCESS', records: [] },
    });
    expect(native.status).toBe('NO_EVENT');
    expect(native.channelState).toBe('NO_EVENT');
    expect(native.events).toHaveLength(0);
  });
});
