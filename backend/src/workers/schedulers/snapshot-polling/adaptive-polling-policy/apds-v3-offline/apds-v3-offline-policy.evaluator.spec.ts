import { evaluateApdsV3OfflinePolicy } from './apds-v3-offline-policy.evaluator';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

function baseInput(over: Partial<ApdsV3OfflinePolicyInput> = {}): ApdsV3OfflinePolicyInput {
  const now = 1_700_000_000_000;
  return {
    organizationId: 'org_a',
    vehicleId: 'veh_1',
    providerSourceLinkId: 'link_1',
    decisionAtMs: now,
    reconciliation: true,
    tripFsmState: 'RESTING',
    activityTier: 'RESTING_STANDBY',
    lastPhysicalPollMs: now - 120_000,
    lastLvProviderSourceMs: now - 60_000,
    lastProviderFetchedAtMs: now - 55_000,
    lastTopLevelProviderSourceMs: now - 58_000,
    profileClass: 'STABLE_PERIODIC',
    medianIntervalMs: 600_000,
    providerGapOpen: false,
    providerWakeOrReconnect: false,
    sourceLinkInvalidated: false,
    providerErrorRecent: false,
    p2cTopLevelAdvanceKnown: true,
    consumerDemandRevision: 'APDS_V3_CONSUMER_DEMAND_V1',
    signalProfileRevision: 'vsi-rev-1',
    ...over,
  };
}

describe('evaluateApdsV3OfflinePolicy', () => {
  it('forces poll on active trip', () => {
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({ tripFsmState: 'ACTIVE', reconciliation: true }),
    );
    expect(d.decision).toBe('FORCED_SAFETY_POLL');
  });

  it('NOT_ASSESSABLE for KS_MX calibration exclusion', () => {
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({ excludeFromOptimizationCalibration: true }),
    );
    expect(d.decision).toBe('NOT_ASSESSABLE');
    expect(d.reason).toContain('KS_MX');
  });

  it('fail-closed on contradictory top-level vs LV ordering', () => {
    const now = 1_700_000_000_000;
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({
        lastLvProviderSourceMs: now - 10_000,
        lastTopLevelProviderSourceMs: now - 100_000,
      }),
    );
    expect(d.decision).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('does not use future observations — decisionAt before LV advance excluded', () => {
    const decisionAt = 1_700_000_000_000;
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({
        decisionAtMs: decisionAt,
        lastLvProviderSourceMs: decisionAt + 60_000,
        lastTopLevelProviderSourceMs: decisionAt + 60_000,
      }),
    );
    expect(d.decision).not.toBe('WOULD_SKIP');
  });

  it('cross-org isolation — decisions are per input identity only', () => {
    const a = evaluateApdsV3OfflinePolicy(baseInput({ organizationId: 'org_a' }));
    const b = evaluateApdsV3OfflinePolicy(
      baseInput({ organizationId: 'org_b', vehicleId: 'veh_2' }),
    );
    expect(a.policyVersion).toBe(b.policyVersion);
    expect(a.decision).toBe(b.decision);
  });

  it('wake override forces poll', () => {
    const d = evaluateApdsV3OfflinePolicy(
      baseInput({ providerWakeOrReconnect: true }),
    );
    expect(d.decision).toBe('FORCED_SAFETY_POLL');
  });

  it('repeatability at UTC boundary', () => {
    const input = baseInput({ decisionAtMs: 1_700_000_000_000 });
    const d1 = evaluateApdsV3OfflinePolicy(input);
    const d2 = evaluateApdsV3OfflinePolicy({ ...input });
    expect(d1).toEqual(d2);
  });
});
