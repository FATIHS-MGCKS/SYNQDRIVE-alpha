import { buildNormalizedRegistrationAiTireSpecJson } from './ai-tire-spec-registration-persist.util';

describe('ai-tire-spec-registration-persist', () => {
  it('normalizes raw aiTireSpec with schemaVersion tire_v2', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      {
        matchedBrand: 'Michelin',
        matchedModel: 'Pilot Sport 4',
        newTreadDepthMm: 7.8,
        euWetGripClass: 'A',
      },
      null,
    );
    expect(json).not.toBeNull();
    const blob = json as Record<string, unknown>;
    expect(blob.schemaVersion).toBe('tire_v2');
    expect(blob.userConfirmedSpec).toBe(false);
    expect(blob.matchedBrand).toBe('Michelin');
    expect(blob.euWetGripClass).toBe('A');
  });

  it('skips overwrite when existing spec is user confirmed', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      { matchedBrand: 'Other' },
      { userConfirmedSpec: true, matchedBrand: 'OEM' },
    );
    expect(json).toBeNull();
  });
});
