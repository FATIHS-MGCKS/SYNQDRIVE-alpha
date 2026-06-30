import {
  TRIP_SIGNAL_SUMMARY_ENRICHMENT,
  ANCHOR_TYPES,
  CONTEXT_CLASSIFICATIONS,
  FUTURE_ONLY_CONTEXT_CLASSIFICATIONS,
  EVIDENCE_GRADES,
  CONTEXT_CONFIDENCES,
  CONTEXT_REASON_CODES,
  SIGNAL_COVERAGE_QUALITIES,
  ENGINE_CONTEXT_SIGNALS,
} from './event-context.types';

const unique = <T>(arr: readonly T[]) => new Set(arr).size === arr.length;

describe('event-context.types', () => {
  describe('Trip Signal Summary Enrichment reframing', () => {
    it('uses the descriptive label, not "Abuse Detection"', () => {
      expect(TRIP_SIGNAL_SUMMARY_ENRICHMENT.label).toBe('Trip Signal Summary Enrichment');
      expect(TRIP_SIGNAL_SUMMARY_ENRICHMENT.label).not.toMatch(/abuse/i);
    });

    it('does not describe the whole-trip HF pass as aggressive abuse detection', () => {
      const desc = TRIP_SIGNAL_SUMMARY_ENRICHMENT.description.toLowerCase();
      expect(desc).toContain('not a primary short-event misuse detector');
      // It must explicitly forbid claiming aggressive misuse from sparse HF.
      expect(desc).toMatch(/must not claim aggressive misuse from sparse/);
    });

    it('declares the descriptive purpose of the summary', () => {
      expect(TRIP_SIGNAL_SUMMARY_ENRICHMENT.purpose).toEqual([
        'speed summary',
        'signal cadence',
        'data quality',
        'signal coverage',
        'detector feasibility',
        'trip assessment status',
      ]);
    });
  });

  describe('enum vocabularies are complete and unique', () => {
    it('AnchorType', () => {
      expect(ANCHOR_TYPES).toHaveLength(1);
      expect(ANCHOR_TYPES).toEqual(['DIMO_NATIVE_BEHAVIOR_EVENT']);
      expect(unique(ANCHOR_TYPES)).toBe(true);
    });
    it('ContextClassification (active only)', () => {
      expect(CONTEXT_CLASSIFICATIONS).toHaveLength(15);
      expect(unique(CONTEXT_CLASSIFICATIONS)).toBe(true);
      expect(CONTEXT_CLASSIFICATIONS).toContain('INSUFFICIENT_CONTEXT');
      expect(CONTEXT_CLASSIFICATIONS).toContain('EMERGENCY_LIKE_BRAKING');
      expect(CONTEXT_CLASSIFICATIONS).not.toContain('REV_IN_IDLE_CONFIRMED');
    });
    it('future-only classifications are not active', () => {
      expect(FUTURE_ONLY_CONTEXT_CLASSIFICATIONS).toEqual([
        'REV_IN_IDLE_CONFIRMED',
        'HIGH_RPM_UNDER_LOAD',
      ]);
      for (const c of FUTURE_ONLY_CONTEXT_CLASSIFICATIONS) {
        expect(CONTEXT_CLASSIFICATIONS).not.toContain(c);
      }
    });
    it('EvidenceGrade', () => {
      expect(EVIDENCE_GRADES).toEqual(['A', 'B', 'C', 'D']);
    });
    it('ContextConfidence includes INSUFFICIENT', () => {
      expect(CONTEXT_CONFIDENCES).toHaveLength(4);
      expect(CONTEXT_CONFIDENCES).toContain('INSUFFICIENT');
    });
    it('ContextReasonCode has no RPM webhook anchor', () => {
      expect(CONTEXT_REASON_CODES).toHaveLength(15);
      expect(unique(CONTEXT_REASON_CODES)).toBe(true);
      expect(CONTEXT_REASON_CODES).toContain('NOT_APPLICABLE_POWERTRAIN');
      expect(CONTEXT_REASON_CODES).not.toContain('RPM_WEBHOOK_ANCHOR' as never);
    });
    it('SignalCoverageQuality', () => {
      expect(SIGNAL_COVERAGE_QUALITIES).toEqual(['GOOD', 'SPARSE', 'MISSING', 'NOT_APPLICABLE']);
    });
    it('EngineContextSignal', () => {
      expect(ENGINE_CONTEXT_SIGNALS).toEqual(['speed', 'rpm', 'throttle', 'engineLoad', 'coolant']);
    });
  });
});
