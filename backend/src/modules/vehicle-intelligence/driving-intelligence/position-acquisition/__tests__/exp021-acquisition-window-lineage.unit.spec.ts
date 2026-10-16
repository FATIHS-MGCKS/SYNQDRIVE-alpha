import { deriveSecondAlignedEnclosingWindow } from '../di-v0-position-window';

/** EXP021 primary case: pinned acquisition window must match trip start/end alignment at S4 execution. */
describe('exp021 acquisition window lineage', () => {
  it('maps 533b2bf8 pin window to second-aligned enclosing interval', () => {
    const startMs = Date.parse('2026-10-14T14:47:05.040Z');
    const endMs = Date.parse('2026-10-14T16:05:18.665Z');
    const w = deriveSecondAlignedEnclosingWindow(startMs, endMs);
    expect(w.fromUtc).toBe('2026-10-14T14:47:05Z');
    expect(w.toUtc).toBe('2026-10-14T16:05:19Z');
    expect(w.widenedStartMs).toBe(40);
    expect(w.widenedEndMs).toBeGreaterThan(0);
  });

  it('maps current canonical short trip end separately from pin window', () => {
    const startMs = Date.parse('2026-10-14T14:47:05.040Z');
    const endMs = Date.parse('2026-10-14T14:58:31.040Z');
    const w = deriveSecondAlignedEnclosingWindow(startMs, endMs);
    expect(w.fromUtc).toBe('2026-10-14T14:47:05Z');
    expect(w.toUtc).toBe('2026-10-14T14:58:32Z');
  });
});
