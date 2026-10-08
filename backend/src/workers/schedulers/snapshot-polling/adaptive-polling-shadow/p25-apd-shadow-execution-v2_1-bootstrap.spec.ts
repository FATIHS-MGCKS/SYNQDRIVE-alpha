import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../adaptive-polling-policy/p25-apd-policy-engine';
import { applyP25ApdShadowSafetyOverlay } from '../adaptive-polling-policy/p25-apd-shadow-overlay';
import { P25_APD_B2_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import { evaluateLvProviderTimestampAdmission } from './p25-apd-shadow-lv-bootstrap.contract';
import {
  isApdShadowAdvancingDecision,
  P25_APD_SHADOW_ADVANCING_DECISIONS,
  P25_APD_SHADOW_LV_BOOTSTRAP_ELIGIBLE_DECISIONS,
} from './p25-apd-shadow-execution-versions';

const MS_10M = 10 * 60_000;

type PollEvent = {
  tMs: number;
  tEndMs: number;
  visibleLvMs: number | null;
  reconciliation: boolean;
};

function overlayDecision(
  coreDecision: string,
  simulatedLastLv: number | null,
): string {
  return applyP25ApdShadowSafetyOverlay(
    {
      policyVersion: P25_APD_B2_V1,
      decision: coreDecision as never,
      reason: 'MISSING_LV_SOURCE_TIMESTAMP',
      expectedWindowStartMs: null,
      expectedWindowEndMs: null,
    },
    {
      r9WakeKnown: false,
      profileInvalidated: false,
      invalidationReason: null,
      providerGapOpen: false,
      reconnectPending: false,
      sourceTimestampMissing: simulatedLastLv == null,
    },
  ).decision;
}

function simulateV2Execution(polls: PollEvent[]) {
  let lastAllowed = 0;
  let simulatedLv: number | null = null;

  for (const p of polls) {
    const core = evaluateP25ApdB2V1Core({
      organizationId: 'o',
      vehicleId: 'v',
      decisionAtMs: p.tMs,
      reconciliation: p.reconciliation,
      lastTrustworthyLvSourceMs: simulatedLv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: !p.reconciliation,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'SPARSE_IRREGULAR',
      lastAllowedReconciliationPollMs: lastAllowed,
    });
    const decision = overlayDecision(core.decision, simulatedLv);

    if (p.reconciliation && p.visibleLvMs != null) {
      const admission = evaluateLvProviderTimestampAdmission({
        visibleLvProviderTimestampMs: p.visibleLvMs,
        pollStartedAtMs: p.tMs,
        pollCompletedAtMs: p.tEndMs,
        reconciliation: true,
        prePollDecision: decision,
      });
      if (admission.admit) {
        simulatedLv =
          simulatedLv == null ? p.visibleLvMs : Math.max(simulatedLv, p.visibleLvMs);
      }
    }

    if (isApdShadowAdvancingDecision(decision)) {
      lastAllowed = p.tMs;
    }
  }

  return { lastAllowed, simulatedLv };
}

function simulateV2BrokenBootstrap(polls: PollEvent[]) {
  let lastAllowed = 0;
  let simulatedLv: number | null = null;

  for (const p of polls) {
    const core = evaluateP25ApdB2V1Core({
      organizationId: 'o',
      vehicleId: 'v',
      decisionAtMs: p.tMs,
      reconciliation: p.reconciliation,
      lastTrustworthyLvSourceMs: simulatedLv,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: !p.reconciliation,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'SPARSE_IRREGULAR',
      lastAllowedReconciliationPollMs: lastAllowed,
    });
    const decision = overlayDecision(core.decision, simulatedLv);

    if (
      p.reconciliation &&
      p.visibleLvMs != null &&
      isApdShadowAdvancingDecision(decision)
    ) {
      simulatedLv =
        simulatedLv == null ? p.visibleLvMs : Math.max(simulatedLv, p.visibleLvMs);
    }

    if (isApdShadowAdvancingDecision(decision)) {
      lastAllowed = p.tMs;
    }
  }

  return { lastAllowed, simulatedLv };
}

describe('APDS-9.5B execution V2.1 LV bootstrap simulation', () => {
  it('frozen advancing set excludes forced-missing bootstrap decisions', () => {
    expect(P25_APD_SHADOW_ADVANCING_DECISIONS).not.toContain(
      'FORCED_SOURCE_TIMESTAMP_MISSING',
    );
    expect(P25_APD_SHADOW_LV_BOOTSTRAP_ELIGIBLE_DECISIONS).toContain(
      'FORCED_SOURCE_TIMESTAMP_MISSING',
    );
  });

  it('V2 semantics deadlock: forced-missing polls never seed LV', () => {
    const t0 = 10_000_000;
    const polls: PollEvent[] = [
      {
        tMs: t0,
        tEndMs: t0 + 2_000,
        visibleLvMs: t0 - 5_000,
        reconciliation: true,
      },
      {
        tMs: t0 + MS_10M,
        tEndMs: t0 + MS_10M + 2_000,
        visibleLvMs: t0 + MS_10M - 5_000,
        reconciliation: true,
      },
    ];
    const broken = simulateV2BrokenBootstrap(polls);
    expect(broken.simulatedLv).toBeNull();
    expect(broken.lastAllowed).toBe(0);
  });

  it('repeated forced-missing sequence exits overlay loop after genuine LV bootstrap', () => {
    const t0 = 25_000_000;
    const polls: PollEvent[] = [
      {
        tMs: t0,
        tEndMs: t0 + 2_000,
        visibleLvMs: t0 - 5_000,
        reconciliation: true,
      },
      {
        tMs: t0 + MS_10M,
        tEndMs: t0 + MS_10M + 2_000,
        visibleLvMs: t0 + MS_10M - 5_000,
        reconciliation: true,
      },
    ];
    const fixed = simulateV2Execution(polls);
    expect(fixed.simulatedLv).toBe(t0 + MS_10M - 5_000);
    const coreSecond = evaluateP25ApdB2V1Core({
      organizationId: 'o',
      vehicleId: 'v',
      decisionAtMs: t0 + MS_10M,
      reconciliation: true,
      lastTrustworthyLvSourceMs: t0 - 5_000,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'SPARSE_IRREGULAR',
      lastAllowedReconciliationPollMs: 0,
    });
    const overlaySecond = overlayDecision(coreSecond.decision, t0 - 5_000);
    expect(overlaySecond).not.toBe('FORCED_SOURCE_TIMESTAMP_MISSING');
  });

  it('V2.1 bootstrap seeds LV without advancing lastAllowed on forced-missing', () => {
    const t0 = 20_000_000;
    const polls: PollEvent[] = [
      {
        tMs: t0,
        tEndMs: t0 + 2_000,
        visibleLvMs: t0 - 5_000,
        reconciliation: true,
      },
    ];
    const fixed = simulateV2Execution(polls);
    expect(fixed.simulatedLv).toBe(t0 - 5_000);
    expect(fixed.lastAllowed).toBe(0);
  });

  it('B2/B4 frozen core outputs are deterministic (execution-layer change only)', () => {
    const fixture = {
      organizationId: 'o',
      vehicleId: 'v',
      decisionAtMs: 30_000_000 + MS_10M,
      reconciliation: true,
      lastTrustworthyLvSourceMs: 30_000_000 - 5_000,
      lastProviderFetchedAtMs: null,
      profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
      medianIntervalMs: 8 * 3600_000,
      tripFsmActive: false,
      providerGapOpen: false,
      r9WakePending: false,
      profileClass: 'SPARSE_IRREGULAR' as const,
      lastAllowedReconciliationPollMs: 0,
    };
    expect(evaluateP25ApdB2V1Core(fixture)).toEqual(evaluateP25ApdB2V1Core(fixture));
    expect(evaluateP25ApdB4V1Core(fixture)).toEqual(evaluateP25ApdB4V1Core(fixture));
  });
});
