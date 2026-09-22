import {
  isPreGapTrustworthyEngineOffEvidenceClass,
  isSuccessfulPollGapEntryOutcome,
  isTransportOrNonPollGapOutcome,
} from './provider-observability-gap-entry.policy';
import { BatteryGeneralizedEvidenceClass } from '@prisma/client';

describe('provider observability gap entry policy', () => {
  it('A: stale replay opens gap candidate', () => {
    expect(isSuccessfulPollGapEntryOutcome('STALE_REPLAY')).toBe(true);
  });

  it('B: duplicate observation extends gap candidate', () => {
    expect(isSuccessfulPollGapEntryOutcome('DUPLICATE_OBSERVATION')).toBe(true);
  });

  it('D: transport/invalid outcomes do not open gap', () => {
    expect(isTransportOrNonPollGapOutcome('INVALID_TIMESTAMP')).toBe(true);
    expect(isSuccessfulPollGapEntryOutcome('NEW_OBSERVATION')).toBe(false);
  });

  it('does not treat pre-gap ENGINE_OFF as gap entry', () => {
    expect(
      isPreGapTrustworthyEngineOffEvidenceClass(
        BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
      ),
    ).toBe(true);
  });
});
