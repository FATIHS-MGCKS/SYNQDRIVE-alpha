import { normalizeDiV0R1ObdFromProviderRows } from '../../r1-obd-acquisition/di-v0-r1-obd-normalizer';
import { validateDiV0PositionAcquisitionRequest } from '../../position-acquisition/di-v0-position-window';
import { resolveDiV0SourceFamily } from '../../position-acquisition/di-v0-position-source-family';
import { baseR1Request, wobSparseR1Rows, RUPTELA_DEVICE_IDENTITY } from '../../r1-obd-acquisition/__tests__/fixtures/s3b-r1-fixtures';
import { countDiV0R1UsableValues, resolveDiV0S4cR1ChannelOutcome } from '../di-v0-s4c-r1-usable';

function norm(from: string, to: string, rows: Record<string, unknown>[]) {
  const request = validateDiV0PositionAcquisitionRequest(baseR1Request(from, to));
  const sf = resolveDiV0SourceFamily(RUPTELA_DEVICE_IDENTITY);
  const out = normalizeDiV0R1ObdFromProviderRows(request, sf, rows, { longGapThresholdSeconds: 30 });
  if (!out.ok) throw new Error(out.failure.message);
  return out.result;
}

describe('resolveDiV0S4cR1ChannelOutcome', () => {
  it('zero rows → PRESENT_SPARSE', () => {
    const r = norm('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z', []);
    expect(countDiV0R1UsableValues(r)).toBe(0);
    expect(resolveDiV0S4cR1ChannelOutcome(r)).toBe('PRESENT_SPARSE');
  });

  it('low coverage with one speed → PRESENT', () => {
    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-01T01:00:00Z';
    const r = norm(from, to, [{ timestamp: '2026-01-01T00:00:01Z', speed: 40 }]);
    expect(r.qualityFlags).toContain('SPARSE_SIGNAL');
    expect(countDiV0R1UsableValues(r)).toBeGreaterThanOrEqual(1);
    expect(resolveDiV0S4cR1ChannelOutcome(r)).toBe('PRESENT');
  });

  it('RPM only → PRESENT', () => {
    const r = norm('2026-01-01T00:00:00Z', '2026-01-01T00:00:10Z', [
      { timestamp: '2026-01-01T00:00:01Z', powertrainCombustionEngineSpeed: 1500 },
    ]);
    expect(resolveDiV0S4cR1ChannelOutcome(r)).toBe('PRESENT');
  });

  it('wob sparse fixture: usable values → PRESENT not PRESENT_SPARSE', () => {
    const from = '2026-01-01T00:00:00Z';
    const to = '2026-01-01T00:01:40Z';
    const r = norm(from, to, wobSparseR1Rows(from));
    expect(r.qualityFlags).toContain('SPARSE_SIGNAL');
    expect(resolveDiV0S4cR1ChannelOutcome(r)).toBe('PRESENT');
  });
});
