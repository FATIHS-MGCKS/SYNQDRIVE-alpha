import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from './p25-apd-policy-versions';
import { p25ApdReplayAllowPoll } from './p25-apd-policy-engine';
import type { P25ApdCadenceProfileClass } from './p25-apd-profile-classifier';

describe('P25 APD JS↔TS policy parity', () => {
  const fixturesPath = `${process.cwd()}/scripts/ops/p25-apd-policy-parity.fixtures.json`;
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8')) as {
    cases: Array<{
      id: string;
      profile: P25ApdCadenceProfileClass;
      medianIntervalMs: number;
      reconciliation: boolean;
      lastAllowedMs: number;
      lastLvSourceMs: number | null;
      nowMs: number;
      b2: boolean;
      b4: boolean;
    }>;
  };

  it('TS replay allow matches fixture expectations (derived from JS core)', () => {
    let b2Mismatch = 0;
    let b4Mismatch = 0;
    for (const c of fixtures.cases) {
      const ctx = {
        reconciliation: c.reconciliation,
        lastAllowedMs: c.lastAllowedMs,
        lastLvSourceMs: c.lastLvSourceMs,
        nowMs: c.nowMs,
        profile: c.profile,
        medianIntervalMs: c.medianIntervalMs,
      };
      if (p25ApdReplayAllowPoll(P25_APD_B2_V1, ctx) !== c.b2) b2Mismatch++;
      if (p25ApdReplayAllowPoll(P25_APD_B4_V1, ctx) !== c.b4) b4Mismatch++;
    }
    expect(b2Mismatch).toBe(0);
    expect(b4Mismatch).toBe(0);
    expect(fixtures.cases.length).toBeGreaterThan(0);
  });

  it('JS parity runner reports zero mismatches', () => {
    const out = execSync('node scripts/ops/p25-apd-policy-parity-runner.mjs', {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    const parsed = JSON.parse(out.trim()) as {
      B2_POLICY_PARITY_MISMATCH_COUNT: number;
      B4_POLICY_PARITY_MISMATCH_COUNT: number;
    };
    expect(parsed.B2_POLICY_PARITY_MISMATCH_COUNT).toBe(0);
    expect(parsed.B4_POLICY_PARITY_MISMATCH_COUNT).toBe(0);
  });
});
