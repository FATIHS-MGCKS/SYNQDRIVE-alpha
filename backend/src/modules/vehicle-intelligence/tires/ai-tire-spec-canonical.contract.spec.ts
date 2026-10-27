import { TIRE_SPEC_FIELD_KEYS, buildTireSpecJsonSchema } from '../../ai/vehicle-specs/tire-spec-ai.schema.util';
import { AI_TIRE_SPEC_LLM_FIELD_KEYS } from './ai-tire-spec-canonical.contract';
import { AI_TIRE_SPEC_NORMALIZER_INPUT_KEYS } from './ai-tire-spec-normalizer';

describe('ai-tire-spec canonical contract', () => {
  it('schema keys match canonical LLM field keys', () => {
    expect([...TIRE_SPEC_FIELD_KEYS].sort()).toEqual([...AI_TIRE_SPEC_LLM_FIELD_KEYS].sort());
  });

  it('normalizer input keys match canonical LLM field keys', () => {
    expect([...AI_TIRE_SPEC_NORMALIZER_INPUT_KEYS].sort()).toEqual(
      [...AI_TIRE_SPEC_LLM_FIELD_KEYS].sort(),
    );
  });

  it('does not request policy thresholds or URL evidence from the model', () => {
    const schema = buildTireSpecJsonSchema() as { properties: Record<string, unknown> };
    const keys = Object.keys(schema.properties);
    expect(keys).not.toContain('legalMinTreadDepthMm');
    expect(keys).not.toContain('manufacturerSourceUrl');
    expect(keys).not.toContain('labelSourceUrl');
  });
});
