import { resolveR1ObdFsmPointAuthority } from '../r1-obd-fsm-point-authority';

describe('resolveR1ObdFsmPointAuthority', () => {
  it('denies DIRECT FSM authority for INTERVAL_ONLY R1 (bucket label is not measurement time)', () => {
    const r = resolveR1ObdFsmPointAuthority({
      temporalConfidence: 'INTERVAL_ONLY',
      bucketLabel: '2026-10-22T18:47:58Z',
    });
    expect(r.fsmPointAuthority).toBe(false);
    expect(r.measurementTimeUtc).toBeNull();
  });
});
