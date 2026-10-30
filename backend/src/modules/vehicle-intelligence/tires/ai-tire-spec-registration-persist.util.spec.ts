import { buildNormalizedRegistrationAiTireSpecJson } from './ai-tire-spec-registration-persist.util';

describe('ai-tire-spec-registration-persist', () => {
  it('normalizes raw aiTireSpec with schemaVersion tire_v3_compact', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      {
        matchedBrand: 'Michelin',
        matchedModel: 'Pilot Sport 4',
        tireSizeRaw: '225/45R17',
        loadIndex: '94',
        speedIndex: 'Y',
        newTreadDepthMm: 7.8,
        euWetGripClass: 'A',
      },
      null,
    );
    expect(json).not.toBeNull();
    const blob = json as Record<string, unknown>;
    expect(blob.schemaVersion).toBe('tire_v3_compact');
    expect(blob.userConfirmedSpec).toBe(false);
    expect(blob.matchedBrand).toBe('Michelin');
    expect(blob.euWetGripClass).toBeNull();
    expect(blob.newTreadDepthMm).toBeNull();
  });

  it('skips overwrite when existing spec is user confirmed', () => {
    const json = buildNormalizedRegistrationAiTireSpecJson(
      { matchedBrand: 'Other' },
      { userConfirmedSpec: true, matchedBrand: 'OEM' },
    );
    expect(json).toBeNull();
  });
});
