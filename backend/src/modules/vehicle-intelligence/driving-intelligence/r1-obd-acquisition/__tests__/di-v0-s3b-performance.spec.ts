import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import { acquireDiV0NativeEventEvidence } from '../../native-event-evidence/di-v0-native-event-acquisition';
import { normalizeDiV0R1ObdFromProviderRows } from '../di-v0-r1-obd-normalizer';
import { baseR1Request, RUPTELA_DEVICE_IDENTITY } from './fixtures/s3b-r1-fixtures';

function sparseRows(count: number, fromUtc: string): Record<string, unknown>[] {
  const start = Date.parse(fromUtc);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    if (i % 11 !== 0) continue;
    rows.push({
      timestamp: new Date(start + i * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      speed: 40,
    });
  }
  return rows;
}

function bench(seconds: number): number {
  const from = '2026-01-01T00:00:00Z';
  const to = new Date(Date.parse(from) + seconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const request = validateDiV0PositionAcquisitionRequest(baseR1Request(from, to));
  const resolution = resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY);
  const rows = sparseRows(seconds, from);
  const t0 = performance.now();
  normalizeDiV0R1ObdFromProviderRows(request, resolution, rows);
  acquireDiV0NativeEventEvidence({
    vehicleId: 'v-perf',
    sourceFamily: 'RUPTELA_R1',
    records: Array.from({ length: Math.min(500, Math.floor(seconds / 2)) }, (_, i) => ({
      id: `e-${i}`,
      providerEventName: 'harshBraking',
      providerTimestamp: new Date(Date.parse(from) + i * 2000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      sourceFamily: 'RUPTELA_R1' as const,
    })),
  });
  return performance.now() - t0;
}

describe('S3B normalization performance (smoke)', () => {
  it('30/60/28800 second windows normalize within generous budget', () => {
    const p30 = bench(1800);
    const p60 = bench(3600);
    const p28800 = bench(28_800);
    expect(p30).toBeLessThan(15_000);
    expect(p60).toBeLessThan(30_000);
    expect(p28800).toBeLessThan(120_000);
  });
});
