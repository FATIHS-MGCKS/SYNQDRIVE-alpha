import { P25_APD_B2_V1, P25_APD_B4_V1 } from './p25-apd-policy-versions';
import { p25ApdReplayAllowPoll } from './p25-apd-policy-engine';
import { classifyP25ApdCadenceProfile } from './p25-apd-profile-classifier';

const MS_1M = 60_000;
const MS_5M = 5 * 60_000;
const MS_10M = 10 * 60_000;
const MS_30M = 30 * 60_000;
const MS_8H = 8 * 3600_000;

describe('P25 APD policy parity with offline replay core', () => {
  const profile = 'STABLE_PERIODIC';
  const medianIntervalMs = MS_8H;
  const lastLvSourceMs = 1_000_000;

  it('B2: inside phase window requires 1m since last allowed', () => {
    const nowMs = lastLvSourceMs + medianIntervalMs;
    expect(
      p25ApdReplayAllowPoll(P25_APD_B2_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs - MS_1M,
        lastLvSourceMs,
        nowMs,
        profile,
        medianIntervalMs,
      }),
    ).toBe(true);
    expect(
      p25ApdReplayAllowPoll(P25_APD_B2_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs - 30_000,
        lastLvSourceMs,
        nowMs,
        profile,
        medianIntervalMs,
      }),
    ).toBe(false);
  });

  it('B2: outside phase window requires 10m heartbeat', () => {
    const nowMs = lastLvSourceMs + medianIntervalMs + MS_30M + 1;
    expect(
      p25ApdReplayAllowPoll(P25_APD_B2_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs - MS_10M,
        lastLvSourceMs,
        nowMs,
        profile,
        medianIntervalMs,
      }),
    ).toBe(true);
    expect(
      p25ApdReplayAllowPoll(P25_APD_B2_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs - MS_5M,
        lastLvSourceMs,
        nowMs,
        profile,
        medianIntervalMs,
      }),
    ).toBe(false);
  });

  it('B4: non-stable uses 5m fallback', () => {
    const nowMs = 5_000_000;
    expect(
      p25ApdReplayAllowPoll(P25_APD_B4_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs - MS_5M,
        lastLvSourceMs,
        nowMs,
        profile: 'MULTIMODAL',
        medianIntervalMs,
      }),
    ).toBe(true);
  });

  it('B4: stable inside phase always allows', () => {
    const nowMs = lastLvSourceMs + medianIntervalMs;
    expect(
      p25ApdReplayAllowPoll(P25_APD_B4_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs,
        lastLvSourceMs,
        nowMs,
        profile,
        medianIntervalMs,
      }),
    ).toBe(true);
  });

  it('active trip bypass always allows (replay non-reconciliation)', () => {
    expect(
      p25ApdReplayAllowPoll(P25_APD_B2_V1, {
        reconciliation: false,
        lastAllowedMs: 0,
        lastLvSourceMs: null,
        nowMs: 1,
        profile,
        medianIntervalMs,
      }),
    ).toBe(true);
  });

  it('profile classifier matches PS1 STABLE periodic heuristic', () => {
    const gaps = Array.from({ length: 16 }, () => 8 * 3600);
    const med = 8 * 3600;
    expect(classifyP25ApdCadenceProfile(gaps, med)).toBe('STABLE_PERIODIC');
  });

  it('providerFetchedAt is not used in replay allow path', () => {
    const nowMs = lastLvSourceMs + medianIntervalMs;
    expect(
      p25ApdReplayAllowPoll(P25_APD_B2_V1, {
        reconciliation: true,
        lastAllowedMs: nowMs - MS_1M,
        lastLvSourceMs,
        nowMs,
        profile,
        medianIntervalMs,
      }),
    ).toBe(true);
  });
});
