import { evaluateP25ApdProfile } from './p25-apd-profile-evaluator';
import {
  P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS,
  resolveP25ApdProfileMedianCadenceMs,
} from './p25-apd-profile-semantics';

const baseInput = {
  nowMs: 2_000_000_000_000,
  providerGapOpen: false,
  tripActive: false,
  r9WakeRecent: false,
  deviceReconnectRecent: false,
  providerReconnectRecent: false,
  earlyAdvanceDetected: false,
  lateAdvanceDetected: false,
  phaseDriftDetected: false,
  capabilityChanged: false,
};

describe('evaluateP25ApdProfile median PS1 parity', () => {
  it('uses frozen 8h fallback when there are no eligible gaps', () => {
    const evalResult = evaluateP25ApdProfile({
      ...baseInput,
      lvProviderTimestampsMs: [1_000_000_000_000],
    });
    expect(evalResult.medianCadenceMs).toBe(P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS);
    expect(evalResult.profileClass).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('uses frozen 8h fallback when eligible gap evidence is sparse (<5 gaps)', () => {
    const ts = 2_900_000_000_000;
    const lvProviderTimestampsMs = [ts, ts + 8 * 3600_000];
    const evalResult = evaluateP25ApdProfile({
      ...baseInput,
      lvProviderTimestampsMs,
    });
    expect(evalResult.sampleCount).toBe(1);
    expect(evalResult.medianCadenceMs).toBe(P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS);
  });

  it('retains empirical median when sufficient eligible gap evidence exists', () => {
    const start = 2_900_000_000_000;
    const step = 8 * 3600_000;
    const lvProviderTimestampsMs = Array.from({ length: 7 }, (_, i) => start + i * step);
    const evalResult = evaluateP25ApdProfile({
      ...baseInput,
      lvProviderTimestampsMs,
    });
    expect(evalResult.sampleCount).toBe(6);
    expect(evalResult.medianCadenceMs).toBe(step);
  });

  it('applies PS1 electric zero strict-rest row observability gap class', () => {
    const evalResult = evaluateP25ApdProfile({
      ...baseInput,
      lvProviderTimestampsMs: [],
      vehicleFuelType: 'ELECTRIC',
    });
    expect(evalResult.profileClass).toBe('PROVIDER_OBSERVABILITY_GAP');
  });

  it('resolveP25ApdProfileMedianCadenceMs matches PS1 authority constant', () => {
    expect(resolveP25ApdProfileMedianCadenceMs(0)).toBe(28_800_000);
    expect(P25_APD_PS1_PROFILE_MEDIAN_INTERVAL_FALLBACK_MS).toBe(8 * 3600 * 1000);
  });
});
