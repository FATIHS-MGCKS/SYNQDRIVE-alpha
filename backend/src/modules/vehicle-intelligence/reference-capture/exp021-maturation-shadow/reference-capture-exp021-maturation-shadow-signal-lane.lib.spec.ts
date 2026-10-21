import { Exp021MaturationShadowSignalLane } from '@prisma/client';
import {
  countSettlementShadowManifestSignals,
  resolveFrozenStratumSemantics,
} from './reference-capture-exp021-maturation-shadow-signal-lane.lib';

describe('resolveFrozenStratumSemantics', () => {
  const windowTo = new Date('2026-09-16T12:00:00.000Z');

  it('freezes 60s and 90s fixed windows', () => {
    for (const geometryMs of [60_000, 90_000] as const) {
      const windowFrom = new Date(windowTo.getTime() - geometryMs);
      const semantics = resolveFrozenStratumSemantics({
        signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
        queryGeometryMs: geometryMs,
        windowFrom,
        windowTo,
      });
      expect(semantics.resolvedProviderFieldsCanonicalSorted.length).toBeGreaterThan(0);
      expect(semantics.interval).toBe('1s');
      expect(semantics.manifestIdentifier).toContain('DIMO_LTE_R1_REFERENCE_MANIFEST');
    }
  });

  it('settlement lane uses 33-signal manifest authority', () => {
    expect(countSettlementShadowManifestSignals()).toBe(33);
  });

  it('HF lane semantics differ from settlement lane', () => {
    const geometryMs = 60_000;
    const windowFrom = new Date(windowTo.getTime() - geometryMs);
    const hf = resolveFrozenStratumSemantics({
      signalLane: Exp021MaturationShadowSignalLane.HF_FAST_LOOP,
      queryGeometryMs: geometryMs,
      windowFrom,
      windowTo,
    });
    const settlement = resolveFrozenStratumSemantics({
      signalLane: Exp021MaturationShadowSignalLane.SETTLEMENT_SHADOW,
      queryGeometryMs: geometryMs,
      windowFrom,
      windowTo,
    });
    expect(hf.signalSetHash).not.toBe(settlement.signalSetHash);
  });
});
