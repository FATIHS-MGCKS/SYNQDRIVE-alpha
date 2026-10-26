import { TireEvidenceSource } from '@prisma/client';
import {
  buildAiTireSpecApplySetupUpdate,
  isProtectedTreadBaseline,
} from './ai-tire-spec-apply.util';
import type { PersistedAiTireSpec } from './ai-tire-spec-normalizer';

function persisted(overrides: Partial<PersistedAiTireSpec> = {}): PersistedAiTireSpec {
  return {
    matchedBrand: 'Michelin',
    matchedModel: 'Pilot',
    matchedVariant: null,
    tireSizeRaw: null,
    widthMm: 225,
    aspectRatio: 45,
    rimDiameterInch: 17,
    loadIndex: '94',
    speedIndex: 'Y',
    seasonType: 'summer',
    vehicleClassFit: null,
    runFlat: null,
    reinforced: null,
    xl: null,
    evOptimized: null,
    maxLoadKg: null,
    maxInflationKpa: null,
    maxInflationPsi: null,
    newTreadDepthMm: 8.5,
    legalMinimumMm: 1.6,
    recommendedReplacementDepthMm: 3,
    operationalReplacementDepthMm: 4,
    intendedUse: null,
    longevityBias: null,
    aggressiveDrivingSensitivity: null,
    underinflationSensitivity: null,
    heatSensitivity: null,
    payloadBias: null,
    urbanBias: null,
    highwayBias: null,
    tireArchetype: null,
    confidenceScore: 80,
    manufacturerSourceUrl: null,
    labelSourceUrl: null,
    userConfirmedSpec: false,
    specSourceType: 'ai_agent',
    tireSpecConfidence: 80,
    fetchedAt: '2026-01-01T00:00:00.000Z',
    jobId: 'job-1',
    normalizedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ai-tire-spec-apply.util', () => {
  it('detects protected baselines', () => {
    expect(isProtectedTreadBaseline(TireEvidenceSource.USER_CONFIRMED)).toBe(true);
    expect(isProtectedTreadBaseline(TireEvidenceSource.MANUAL_MEASUREMENT)).toBe(true);
    expect(isProtectedTreadBaseline(TireEvidenceSource.AI_ESTIMATED)).toBe(false);
  });

  it('does not overwrite USER_CONFIRMED tread provenance', () => {
    const update = buildAiTireSpecApplySetupUpdate({
      setup: { initialTreadEvidenceSource: TireEvidenceSource.USER_CONFIRMED },
      persisted: persisted({ userConfirmedSpec: true }),
      confidenceScore: 90,
    });
    expect(update.aiTireSpec.userConfirmedSpec).toBe(true);
    expect(update.initialTreadEvidenceSource).toBeUndefined();
  });

  it('sets AI_ESTIMATED baseline for unanchored setups without using nominal tread', () => {
    const update = buildAiTireSpecApplySetupUpdate({
      setup: { initialTreadEvidenceSource: null },
      persisted: persisted({ newTreadDepthMm: 8.5 }),
      confidenceScore: 80,
    });
    expect(update.initialTreadEvidenceSource).toBe(TireEvidenceSource.AI_ESTIMATED);
    expect(update.baselineStatus).toBeDefined();
  });

  it('preserves measured tread anchors even when evidence source is unset', () => {
    const update = buildAiTireSpecApplySetupUpdate({
      setup: {
        initialTreadEvidenceSource: null,
        initialTreadFrontMm: 6.2,
      },
      persisted: persisted(),
      confidenceScore: 70,
    });
    expect(update.initialTreadEvidenceSource).toBeUndefined();
  });
});
