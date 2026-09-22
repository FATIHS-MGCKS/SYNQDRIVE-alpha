import {
  canExtendOpenProviderObservabilityGap,
  canOpenNewProviderObservabilityGap,
  isPreGapTrustworthyEngineOffEvidenceClass,
} from './provider-observability-gap-entry.policy';
import { BatteryGeneralizedEvidenceClass } from '@prisma/client';

describe('provider observability gap entry policy (B1.2Y1.1)', () => {
  it('STALE_REPLAY required for new gap', () => {
    expect(canOpenNewProviderObservabilityGap('STALE_REPLAY')).toBe(true);
    expect(canOpenNewProviderObservabilityGap('DUPLICATE_OBSERVATION')).toBe(false);
  });

  it('duplicate before threshold cannot open; may extend when OPEN', () => {
    expect(canExtendOpenProviderObservabilityGap('DUPLICATE_OBSERVATION')).toBe(true);
    expect(canOpenNewProviderObservabilityGap('DUPLICATE_OBSERVATION')).toBe(false);
  });

  it('stale replay may open or extend', () => {
    expect(canExtendOpenProviderObservabilityGap('STALE_REPLAY')).toBe(true);
    expect(canOpenNewProviderObservabilityGap('STALE_REPLAY')).toBe(true);
  });

  it('pre-gap trustworthy ENGINE_OFF blocks gap entry classification', () => {
    expect(
      isPreGapTrustworthyEngineOffEvidenceClass(
        BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
      ),
    ).toBe(true);
  });
});
