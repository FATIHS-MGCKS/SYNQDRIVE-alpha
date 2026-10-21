import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../adaptive-polling-policy/p25-apd-policy-engine';

const MS_1M = 60_000;
const MS_5M = 5 * 60_000;
const MS_10M = 10 * 60_000;

function livePolicyAt(
  policy: 'B2' | 'B4',
  lastAllowed: number,
  lastLv: number | null,
  reconciliation: boolean,
  decisionAtMs: number,
) {
  const base = {
    organizationId: 'o',
    vehicleId: 'v1',
    decisionAtMs,
    reconciliation,
    lastTrustworthyLvSourceMs: lastLv,
    lastProviderFetchedAtMs: null,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    medianIntervalMs: 8 * 3600_000,
    tripFsmActive: !reconciliation,
    providerGapOpen: false,
    r9WakePending: false,
    profileClass: 'STABLE_PERIODIC' as const,
    lastAllowedReconciliationPollMs: lastAllowed,
  };
  const core =
    policy === 'B2' ? evaluateP25ApdB2V1Core(base) : evaluateP25ApdB4V1Core(base);
  const allow = core.decision !== 'WOULD_SKIP';
  return { allow, decision: core.decision };
}

function simulateLiveTimeline(
  polls: Array<{ tMs: number; tEndMs: number }>,
  inTrip: (tMs: number) => boolean,
) {
  let b2Last = 0;
  let b4Last = 0;
  let b2Lv: number | null = null;
  let b4Lv: number | null = null;
  const decisions: Array<{ b2: string; b4: string; b2Last: number; b4Last: number }> = [];

  for (const p of polls) {
    const reconciliation = !inTrip(p.tMs);
    const b2 = livePolicyAt('B2', b2Last, b2Lv, reconciliation, p.tMs);
    const b4 = livePolicyAt('B4', b4Last, b4Lv, reconciliation, p.tMs);
    decisions.push({
      b2: b2.decision,
      b4: b4.decision,
      b2Last,
      b4Last,
    });
    if (b2.allow) b2Last = p.tMs;
    if (b4.allow) b4Last = p.tMs;
    if (reconciliation && b2.allow) b2Lv = p.tMs - 1000;
    if (reconciliation && b4.allow) b4Lv = p.tMs - 1000;
  }
  return { b2Last, b4Last, b2Lv, b4Lv, decisions };
}

describe('APDS-9.2B frozen replay state parity (synthetic)', () => {
  it('B2 1m boundary uses poll start not completion', () => {
    const med = 8 * 3600_000;
    const lastAllowed = 1_000_000;
    const lastLv = lastAllowed - med + 30_000;
    const pollStart = lastAllowed + 59_000;
    const pollEnd = pollStart + 120_000;
    const atStart = livePolicyAt('B2', lastAllowed, lastLv, true, pollStart);
    const atEnd = livePolicyAt('B2', lastAllowed, lastLv, true, pollEnd);
    expect(atStart.allow).toBe(false);
    expect(atEnd.allow).toBe(true);
  });

  it('B2 10m boundary uses poll start', () => {
    const t0 = 2_000_000;
    const at9m = livePolicyAt('B2', t0, null, true, t0 + 9 * MS_1M);
    const at10m = livePolicyAt('B2', t0, null, true, t0 + MS_10M);
    expect(at9m.allow).toBe(false);
    expect(at10m.allow).toBe(true);
  });

  it('B4 5m boundary uses poll start', () => {
    const t0 = 3_000_000;
    const at4m = livePolicyAt('B4', t0, null, true, t0 + 4 * MS_1M);
    const at5m = livePolicyAt('B4', t0, null, true, t0 + MS_5M);
    expect(at4m.allow).toBe(false);
    expect(at5m.allow).toBe(true);
  });

  it('active-trip poll advances shared lastAllowed for next reconciliation poll', () => {
    const polls = [
      { tMs: 10_000, tEndMs: 10_500 },
      { tMs: 20_000, tEndMs: 20_500 },
    ];
    const inTrip = (t: number) => t === 10_000;
    const live = simulateLiveTimeline(polls, inTrip);
    expect(live.b2Last).toBe(10_000);
  });

  it('B2 and B4 lastAllowed can diverge under MULTIMODAL cadence', () => {
    const t0 = 5_000_000;
    const lv = t0 - 8 * 3600_000;
    const b2At2m = evaluateP25ApdB2V1Core({
      organizationId: 'o',
      vehicleId: 'v1',
      decisionAtMs: t0 + 2 * MS_1M,
      reconciliation: true,
      lastTrustworthyLvSourceMs: lv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'STABLE_PERIODIC',
      lastAllowedReconciliationPollMs: t0,
    });
    const b4At2m = evaluateP25ApdB4V1Core({
      organizationId: 'o',
      vehicleId: 'v1',
      decisionAtMs: t0 + 2 * MS_1M,
      reconciliation: true,
      lastTrustworthyLvSourceMs: lv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'MULTIMODAL',
      lastAllowedReconciliationPollMs: t0,
    });
    expect(b2At2m.decision).not.toBe('WOULD_SKIP');
    expect(b4At2m.decision).toBe('WOULD_SKIP');
  });
});
