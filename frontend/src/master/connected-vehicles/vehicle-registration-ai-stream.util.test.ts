import { describe, expect, it } from 'vitest';
import {
  resolveVehicleAiSpecsProvenance,
  shouldApplyVehicleAiSpecsFromStreamResult,
} from './vehicle-registration-ai-stream.util';

describe('vehicle-registration-ai-stream.util', () => {
  it('accepts knowledge-only successful specs', () => {
    expect(
      shouldApplyVehicleAiSpecsFromStreamResult({
        success: true,
        degraded: true,
        knowledgeOnlyFallback: true,
        specs: { curbWeightKg: 1400 },
      }),
    ).toBe(true);
  });

  it('rejects empty specs', () => {
    expect(
      shouldApplyVehicleAiSpecsFromStreamResult({
        success: true,
        specs: {},
      }),
    ).toBe(false);
  });

  it('maps knowledge-only provenance', () => {
    expect(
      resolveVehicleAiSpecsProvenance({ knowledgeOnlyFallback: true }),
    ).toBe('mistral_knowledge_only');
  });
});
