import { describe, expect, it } from 'vitest';
import { buildAiFieldProvenanceFromSpecs } from './vehicle-ai-field-provenance.util';

describe('buildAiFieldProvenanceFromSpecs', () => {
  it('tags non-null spec fields as AI_ESTIMATED for live Mistral', () => {
    const map = buildAiFieldProvenanceFromSpecs(
      { curbWeightKg: 1800, variantConfidence: 0.8, drivetrain: null },
      { provenance: 'mistral_live', variantConfidence: 0.8 },
    );
    expect(map.curbWeightKg).toEqual({ category: 'AI_ESTIMATED', confidence: 0.8 });
    expect(map.drivetrain).toBeUndefined();
  });

  it('uses KNOWLEDGE_ONLY for degraded knowledge-only fallback', () => {
    const map = buildAiFieldProvenanceFromSpecs(
      { tankCapacityLiters: 55 },
      { provenance: 'mistral_knowledge_only' },
    );
    expect(map.tankCapacityLiters?.category).toBe('KNOWLEDGE_ONLY');
  });
});
