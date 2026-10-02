import type { BatteryRestSessionFeature } from '@prisma/client';
import {
  BatteryRestSessionChargeOpportunityClass,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
} from '@prisma/client';
import {
  buildUniqueDigestVerificationRows,
  computeDigestVerificationAccounting,
} from './rest-session-feature-shadow-inspection.digest';

function row(id: string, revision: number): BatteryRestSessionFeature {
  return {
    id,
    semanticRevision: revision,
    inputDigest: `${id}-digest`.padEnd(64, '0'),
    inputSummary: { inputContractVersion: 'M3_3C_FEATURE_INPUT_V1' },
    computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
    sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
    chargeOpportunityClass: BatteryRestSessionChargeOpportunityClass.UNKNOWN,
    computedAt: new Date('2026-09-22T10:00:00.000Z'),
  } as unknown as BatteryRestSessionFeature;
}

describe('rest-session-feature-shadow-inspection.digest (C5A.2)', () => {
  it('CANONICAL_WITHIN_WINDOW_DIGEST_DEDUPE: canonical counted once', () => {
    const latest = [row('same', 50)];
    const unique = buildUniqueDigestVerificationRows({
      latestRows: latest,
      canonicalRow: latest[0],
    });
    expect(unique).toHaveLength(1);
    const acct = computeDigestVerificationAccounting({
      totalRows: 1,
      latestRows: latest,
      canonicalRow: latest[0],
      includeRaw: false,
    });
    expect(acct.digestRowsChecked).toBe(1);
    expect(acct.digestRowsUnchecked).toBe(0);
    expect(acct.digestVerificationScope).toBe('FULL');
  });

  it('CANONICAL_OUTSIDE_WINDOW: canonical adds one checked row', () => {
    const latest = [row('latest', 100)];
    const canonical = row('canonical', 1);
    expect(
      buildUniqueDigestVerificationRows({ latestRows: latest, canonicalRow: canonical }),
    ).toHaveLength(2);
    const acct = computeDigestVerificationAccounting({
      totalRows: 125,
      latestRows: latest,
      canonicalRow: canonical,
      includeRaw: false,
    });
    expect(acct.digestRowsChecked).toBe(2);
    expect(acct.digestRowsUnchecked).toBe(123);
    expect(acct.digestVerificationScope).toBe('BOUNDED_LATEST_WINDOW');
    expect(acct.revisions).toHaveLength(1);
    expect(acct.canonicalFeature?.id).toBe('canonical');
  });
});
