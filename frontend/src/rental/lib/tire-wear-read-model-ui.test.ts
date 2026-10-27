import { describe, expect, it } from 'vitest';
import type { TireHealthSummaryResponse } from '../../lib/api';
import {
  formatV3AuthoritativeHeadline,
  isTireWearV3Authoritative,
  resolveLegacyTreadLifePercent,
  resolveTireHealthBoxBarPercent,
} from './tire-wear-read-model-ui';

function summary(overrides: Partial<TireHealthSummaryResponse>): TireHealthSummaryResponse {
  return {
    overallPercent: 72,
    displayTreadMm: 5.5,
    ...overrides,
  } as TireHealthSummaryResponse;
}

describe('tire-wear-read-model-ui', () => {
  it('detects authoritative V3', () => {
    expect(
      isTireWearV3Authoritative(
        summary({
          wearReadModel: 'v3',
          wearV3: { verificationStatus: 'CURRENT', insufficientEvidence: false, wheels: [] } as never,
        }),
      ),
    ).toBe(true);
    expect(isTireWearV3Authoritative(summary({ wearReadModel: 'v2' }))).toBe(false);
  });

  it('suppresses legacy tread-life percent under V3 authority', () => {
    expect(
      resolveLegacyTreadLifePercent(summary({ wearReadModel: 'v3', wearV3: { wheels: [] } as never }), 80),
    ).toBeNull();
    expect(resolveLegacyTreadLifePercent(summary({ wearReadModel: 'v2' }), 80)).toBe(72);
  });

  it('uses mm-based bar percent for V3', () => {
    expect(
      resolveTireHealthBoxBarPercent(
        summary({
          wearReadModel: 'v3',
          displayTreadMm: 4,
          wearV3: { insufficientEvidence: false, wheels: [] } as never,
        }),
      ),
    ).toBe(50);
  });

  it('headline shows insufficient evidence without inventing mm', () => {
    expect(
      formatV3AuthoritativeHeadline(
        summary({
          wearReadModel: 'v3',
          wearV3: {
            insufficientEvidence: true,
            verificationStatus: 'INSUFFICIENT_EVIDENCE',
            wheels: [],
          } as never,
        }),
      ),
    ).toContain('Insufficient evidence');
  });
});
