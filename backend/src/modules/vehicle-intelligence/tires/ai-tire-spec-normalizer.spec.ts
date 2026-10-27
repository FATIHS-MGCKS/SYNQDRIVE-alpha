import { normalizeAiTireSpecResult } from './ai-tire-spec-normalizer';

describe('ai-tire-spec-normalizer V2', () => {
  it('nulls out-of-range newTreadDepthMm instead of clamping', () => {
    const spec = normalizeAiTireSpecResult({ newTreadDepthMm: 80, matchedBrand: 'Michelin' });
    expect(spec.newTreadDepthMm).toBeNull();
  });

  it('persists EU label and UTQG fields when in range', () => {
    const spec = normalizeAiTireSpecResult({
      matchedBrand: 'Continental',
      euWetGripClass: 'A',
      utqgTraction: 'AA',
      utqgTreadwear: 320,
    });
    expect(spec.euWetGripClass).toBe('A');
    expect(spec.utqgTraction).toBe('AA');
    expect(spec.utqgTreadwear).toBe(320);
  });

  it('normalizes intendedUse arrays to canonical comma-separated tags', () => {
    const spec = normalizeAiTireSpecResult({
      intendedUse: ['touring', 'sport'],
      matchedBrand: 'Pirelli',
    });
    expect(spec.intendedUse).toBe('touring,sport');
  });

  it('does not retain manufacturer URLs from AI output', () => {
    const spec = normalizeAiTireSpecResult({
      manufacturerSourceUrl: 'https://example.com/spec.pdf',
      newTreadDepthMm: 8,
      matchedBrand: 'Michelin',
    });
    expect(spec.manufacturerSourceUrl).toBeNull();
  });
});
