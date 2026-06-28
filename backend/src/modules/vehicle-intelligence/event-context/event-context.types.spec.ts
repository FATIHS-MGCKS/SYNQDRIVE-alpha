import {
  TRIP_SIGNAL_SUMMARY_ENRICHMENT,
  ANCHOR_TYPES,
  CONTEXT_CLASSIFICATIONS,
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
      expect(ANCHOR_TYPES).toHaveLength(2);
      expect(unique(ANCHOR_TYPES)).toBe(true);
    });
    it('ContextClassification', () => {
      expect(CONTEXT_CLASSIFICATIONS).toHaveLength(17);
      expect(unique(CONTEXT_CLASSIFICATIONS)).toBe(true);
      expect(CONTEXT_CLASSIFICATIONS).toContain('INSUFFICIENT_CONTEXT');
      expect(CONTEXT_CLASSIFICATIONS).toContain('EMERGENCY_LIKE_BRAKING');
    });
    it('EvidenceGrade', () => {
      expect(EVIDENCE_GRADES).toEqual(['A', 'B', 'C', 'D']);
    });
    it('ContextConfidence includes INSUFFICIENT', () => {
      expect(CONTEXT_CONFIDENCES).toHaveLength(4);
      expect(CONTEXT_CONFIDENCES).toContain('INSUFFICIENT');
    });
    it('ContextReasonCode', () => {
      expect(CONTEXT_REASON_CODES).toHaveLength(16);
      expect(unique(CONTEXT_REASON_CODES)).toBe(true);
      expect(CONTEXT_REASON_CODES).toContain('NOT_APPLICABLE_POWERTRAIN');
    });
    it('SignalCoverageQuality', () => {
      expect(SIGNAL_COVERAGE_QUALITIES).toEqual(['GOOD', 'SPARSE', 'MISSING', 'NOT_APPLICABLE']);
    });
    it('EngineContextSignal', () => {
      expect(ENGINE_CONTEXT_SIGNALS).toEqual(['speed', 'rpm', 'throttle', 'engineLoad', 'coolant']);
    });
  });
});
