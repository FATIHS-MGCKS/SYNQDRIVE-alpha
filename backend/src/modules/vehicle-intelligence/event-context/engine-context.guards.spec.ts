import {
  isLteR1NativeEventCapable,
  isIceEngineContextApplicable,
  isEvContextApplicable,
  shouldRunIceEventContextEnrichment,
  shouldSkipIceContextForEv,
} from './engine-context.guards';

describe('engine-context.guards', () => {
  describe('LTE_R1 ICE (combustion)', () => {
    const ice = { hardwareType: 'LTE_R1' as const, fuelType: 'GASOLINE' };

    it('is native-event capable', () => {
      expect(isLteR1NativeEventCapable(ice)).toBe(true);
    });

    it('allows ICE engine context', () => {
      expect(isIceEngineContextApplicable(ice)).toBe(true);
      expect(isEvContextApplicable(ice)).toBe(false);
    });

    it('runs ICE event-context enrichment and does not skip for EV', () => {
      expect(shouldRunIceEventContextEnrichment(ice)).toBe(true);
      expect(shouldSkipIceContextForEv(ice)).toBe(false);
    });

    it('treats unknown fuelType conservatively as engine-capable', () => {
      const unknownFuel = { hardwareType: 'LTE_R1' as const, fuelType: null };
      expect(isIceEngineContextApplicable(unknownFuel)).toBe(true);
      expect(shouldRunIceEventContextEnrichment(unknownFuel)).toBe(true);
    });
  });

  describe('LTE_R1 EV / Tesla', () => {
    const ev = { hardwareType: 'LTE_R1' as const, fuelType: 'ELECTRIC' };

    it('keeps native-event intake enabled (must not be disabled by EV guard)', () => {
      expect(isLteR1NativeEventCapable(ev)).toBe(true);
    });

    it('skips ICE engine context', () => {
      expect(isIceEngineContextApplicable(ev)).toBe(false);
      expect(isEvContextApplicable(ev)).toBe(true);
      expect(shouldRunIceEventContextEnrichment(ev)).toBe(false);
      expect(shouldSkipIceContextForEv(ev)).toBe(true);
    });
  });

  describe('SMART5 / UNKNOWN — no LTE_R1 ICE context classification', () => {
    const smart5 = { hardwareType: 'SMART5' as const, fuelType: 'GASOLINE' };
    const unknown = { hardwareType: 'UNKNOWN' as const, fuelType: null };
    const unknownEv = { hardwareType: 'UNKNOWN' as const, fuelType: 'ELECTRIC' };

    it('SMART5 is not native-event capable and does not run LTE_R1 ICE context', () => {
      expect(isLteR1NativeEventCapable(smart5)).toBe(false);
      expect(shouldRunIceEventContextEnrichment(smart5)).toBe(false);
    });

    it('UNKNOWN is not native-event capable and does not run LTE_R1 ICE context', () => {
      expect(isLteR1NativeEventCapable(unknown)).toBe(false);
      expect(shouldRunIceEventContextEnrichment(unknown)).toBe(false);
    });

    it('UNKNOWN EV is flagged EV and skipped for ICE context', () => {
      expect(isEvContextApplicable(unknownEv)).toBe(true);
      expect(shouldSkipIceContextForEv(unknownEv)).toBe(true);
      expect(shouldRunIceEventContextEnrichment(unknownEv)).toBe(false);
    });
  });

  describe('missing hardwareType defaults to UNKNOWN (safe)', () => {
    it('does not run LTE_R1 ICE context for an empty input', () => {
      expect(isLteR1NativeEventCapable({})).toBe(false);
      expect(shouldRunIceEventContextEnrichment({})).toBe(false);
    });
  });
});
