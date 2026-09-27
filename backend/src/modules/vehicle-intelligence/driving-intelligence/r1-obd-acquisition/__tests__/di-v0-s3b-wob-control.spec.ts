import { acquireDiV0NativeEventEvidence } from '../../native-event-evidence/di-v0-native-event-acquisition';
import { toDiV0S1R1ObdInput } from '../di-v0-r1-obd-acquisition';
import { normalizeDiV0R1ObdFromProviderRows } from '../di-v0-r1-obd-normalizer';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { baseR1Request, RUPTELA_DEVICE_IDENTITY, wobSparseR1Rows } from './fixtures/s3b-r1-fixtures';

describe('WOB FULL-R1-002 structural control (synthetic sparse fixture)', () => {
  it('R1 sparse; native NO_EVENT; no invented events', () => {
    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-01T00:01:40Z';
    const request = validateDiV0PositionAcquisitionRequest(baseR1Request(from, to));
    const resolution = resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY);
    const r1 = normalizeDiV0R1ObdFromProviderRows(request, resolution, wobSparseR1Rows(from));
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const observations = toDiV0S1R1ObdInput(r1.result);
    expect(observations.length).toBeLessThan(r1.result.counters.requestedBuckets);
    expect(r1.result.qualityFlags).toContain('SPARSE_SIGNAL');

    const native = acquireDiV0NativeEventEvidence({
      vehicleId: 'vehicle-golden-c1-mobile-full-r1-002',
      sourceFamily: 'RUPTELA_R1',
      records: [],
    });
    expect(native.status).toBe('NO_EVENT');
    expect(native.events).toHaveLength(0);
  });
});
