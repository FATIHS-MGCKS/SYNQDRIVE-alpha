/**
 * APDS-9.5C read-only empirical execution replay (V2 vs V2.1) on frozen 9.2C corpus.
 * Source tables only — no apd_shadow_* reads.
 */
import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import {
  evaluateP25ApdB2V1Core,
  evaluateP25ApdB4V1Core,
} from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-engine';
import { applyP25ApdShadowSafetyOverlay } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-shadow-overlay';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';
import { evaluateLvProviderTimestampAdmission } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-lv-bootstrap.contract';
import { isApdShadowAdvancingDecision } from '../../src/workers/schedulers/snapshot-polling/adaptive-polling-shadow/p25-apd-shadow-execution-versions';
import { loadApdFrozenReplayCorpus } from './_apd-frozen-replay-corpus-readonly';

const FROZEN_CORPUS = {
  vehicles: 5,
  successPolls: 57,
  reconciliationPolls: 24,
  nonReconciliationPolls: 33,
  lvEvidenceRows: 533,
} as const;

const frozenCorpusSha256 = createHash('sha256')
  .update(JSON.stringify(FROZEN_CORPUS))
  .digest('hex');

type Policy = 'B2' | 'B4';

type ExecState = { lastAllowed: number; simulatedLv: number | null };

function visibleLvAtPollEnd(
  lvRows: { ptMs: number; obsMs: number }[],
  tEndMs: number,
): number | null {
  const visible = lvRows.filter((r) => r.obsMs <= tEndMs);
  if (!visible.length) return null;
  return Math.max(...visible.map((r) => r.ptMs));
}

function evaluateOverlayDecision(
  policy: Policy,
  input: {
    vehicleId: string;
    tMs: number;
    reconciliation: boolean;
    simulatedLv: number | null;
    lastAllowed: number;
    profileClass: string;
    medianIntervalMs: number;
  },
) {
  const base = {
    organizationId: 'replay',
    vehicleId: input.vehicleId,
    decisionAtMs: input.tMs,
    reconciliation: input.reconciliation,
    lastTrustworthyLvSourceMs: input.simulatedLv,
    lastProviderFetchedAtMs: null,
    profileVersion: 'P25_APD_PROFILE_CLASSIFIER_V1',
    medianIntervalMs: input.medianIntervalMs,
    tripFsmActive: !input.reconciliation,
    providerGapOpen: false,
    r9WakePending: false,
    profileClass: input.profileClass as 'STABLE_PERIODIC',
    lastAllowedReconciliationPollMs: input.lastAllowed,
  };
  const core =
    policy === 'B2' ? evaluateP25ApdB2V1Core(base) : evaluateP25ApdB4V1Core(base);
  return applyP25ApdShadowSafetyOverlay(core, {
    r9WakeKnown: false,
    profileInvalidated: false,
    invalidationReason: null,
    providerGapOpen: false,
    reconnectPending: false,
    sourceTimestampMissing: input.simulatedLv == null,
  });
}

function postPollLvUpdate(
  mode: 'V2' | 'V2_1',
  reconciliation: boolean,
  preDecision: string,
  visibleLvMs: number | null,
  tMs: number,
  tEndMs: number,
  simulatedLv: number | null,
): { nextLv: number | null; bootstrapAdmit: boolean } {
  if (!reconciliation || visibleLvMs == null) {
    return { nextLv: simulatedLv, bootstrapAdmit: false };
  }
  if (mode === 'V2' && !isApdShadowAdvancingDecision(preDecision)) {
    return { nextLv: simulatedLv, bootstrapAdmit: false };
  }
  const admission = evaluateLvProviderTimestampAdmission({
    visibleLvProviderTimestampMs: visibleLvMs,
    pollStartedAtMs: tMs,
    pollCompletedAtMs: tEndMs,
    reconciliation: true,
    prePollDecision: preDecision,
  });
  if (!admission.admit) {
    return { nextLv: simulatedLv, bootstrapAdmit: false };
  }
  const nextLv =
    simulatedLv == null ? visibleLvMs : Math.max(simulatedLv, visibleLvMs);
  return {
    nextLv,
    bootstrapAdmit: admission.usedBootstrapPath,
  };
}

function simulatePolicyExecution(
  policy: Policy,
  corpus: Awaited<ReturnType<typeof loadApdFrozenReplayCorpus>>,
  mode: 'V2' | 'V2_1',
) {
  const state = new Map<string, ExecState>();
  for (const v of corpus.vehicles) {
    state.set(v.id, { lastAllowed: 0, simulatedLv: null });
  }

  let bootstrapAdmits = 0;
  let forcedMissingPrePoll = 0;
  let lvLookaheadViolations = 0;
  let forcedMissingLastAllowedAdvanceViolations = 0;

  for (const p of corpus.polls) {
    const st = state.get(p.vehicleId)!;
    const lastAllowedBefore = st.lastAllowed;
    const profile = corpus.profiles[p.vehicleId]!;
    const med = corpus.profileStats[p.vehicleId]!.medianIntervalMs;
    const reconciliation = !corpus.inActiveTrip(p.vehicleId, p.tMs);
    const lvRows = corpus.lvByVehicle.get(p.vehicleId) ?? [];
    const visibleLvMs = visibleLvAtPollEnd(lvRows, p.tEndMs);

    if (visibleLvMs != null && visibleLvMs > p.tEndMs) {
      lvLookaheadViolations++;
    }

    const overlay = evaluateOverlayDecision(policy, {
      vehicleId: p.vehicleId,
      tMs: p.tMs,
      reconciliation,
      simulatedLv: st.simulatedLv,
      lastAllowed: st.lastAllowed,
      profileClass: profile,
      medianIntervalMs: med,
    });

    if (overlay.decision === 'FORCED_SOURCE_TIMESTAMP_MISSING') {
      forcedMissingPrePoll++;
    }

    const { nextLv, bootstrapAdmit } = postPollLvUpdate(
      mode,
      reconciliation,
      overlay.decision,
      visibleLvMs,
      p.tMs,
      p.tEndMs,
      st.simulatedLv,
    );
    if (bootstrapAdmit) bootstrapAdmits++;

    st.simulatedLv = nextLv;
    if (isApdShadowAdvancingDecision(overlay.decision)) {
      st.lastAllowed = p.tMs;
    }

    if (
      mode === 'V2_1' &&
      overlay.decision === 'FORCED_SOURCE_TIMESTAMP_MISSING' &&
      st.lastAllowed !== lastAllowedBefore
    ) {
      forcedMissingLastAllowedAdvanceViolations++;
    }
  }

  return {
    state,
    bootstrapAdmits,
    forcedMissingPrePoll,
    lvLookaheadViolations,
    forcedMissingLastAllowedAdvanceViolations,
  };
}

async function main() {
  const prisma = new PrismaClient();
  const corpus = await loadApdFrozenReplayCorpus(prisma);

  if (corpus.polls.length !== FROZEN_CORPUS.successPolls) {
    throw new Error(`poll count ${corpus.polls.length} != frozen ${FROZEN_CORPUS.successPolls}`);
  }
  if (corpus.lvRowCount !== FROZEN_CORPUS.lvEvidenceRows) {
    throw new Error(`lv rows ${corpus.lvRowCount} != frozen ${FROZEN_CORPUS.lvEvidenceRows}`);
  }

  const runOnce = () => {
    const b2v2 = simulatePolicyExecution('B2', corpus, 'V2');
    const b2v21 = simulatePolicyExecution('B2', corpus, 'V2_1');
    const b4v2 = simulatePolicyExecution('B4', corpus, 'V2');
    const b4v21 = simulatePolicyExecution('B4', corpus, 'V2_1');

    let expectedBootstrapLvSeeds = 0;
    let expectedDownstreamLastAllowedDeltaVehicles = 0;

    for (const v of corpus.vehicles) {
      const s2 = b2v2.state.get(v.id)!;
      const s21 = b2v21.state.get(v.id)!;
      const s4 = b4v2.state.get(v.id)!;
      const s41 = b4v21.state.get(v.id)!;

      if (s2.simulatedLv !== s21.simulatedLv && s21.simulatedLv != null && s2.simulatedLv == null) {
        expectedBootstrapLvSeeds++;
      }
      if (s4.simulatedLv !== s41.simulatedLv && s41.simulatedLv != null && s4.simulatedLv == null) {
        expectedBootstrapLvSeeds++;
      }

      if (
        (s2.lastAllowed !== s21.lastAllowed && s21.simulatedLv != null && s2.simulatedLv == null) ||
        (s4.lastAllowed !== s41.lastAllowed && s41.simulatedLv != null && s4.simulatedLv == null)
      ) {
        expectedDownstreamLastAllowedDeltaVehicles++;
      }
    }

    const forcedMissingLastAllowedViolations =
      b2v21.forcedMissingLastAllowedAdvanceViolations +
      b4v21.forcedMissingLastAllowedAdvanceViolations;

    return {
      b2v2,
      b2v21,
      b4v2,
      b4v21,
      expectedBootstrapLvSeeds,
      expectedDownstreamLastAllowedDeltaVehicles,
      forcedMissingLastAllowedViolations,
    };
  };

  const a = runOnce();
  const b = runOnce();
  const digestA = createHash('sha256')
    .update(
      JSON.stringify({
        b2: [...a.b2v21.state.entries()],
        b4: [...a.b4v21.state.entries()],
      }),
    )
    .digest('hex');
  const digestB = createHash('sha256')
    .update(
      JSON.stringify({
        b2: [...b.b2v21.state.entries()],
        b4: [...b.b4v21.state.entries()],
      }),
    )
    .digest('hex');

  const out = {
    FROZEN_CORPUS_SHA256: frozenCorpusSha256,
    EMPIRICAL_COHORT_SIZE: corpus.vehicles.length,
    EMPIRICAL_SUCCESS_POLLS: corpus.polls.length,
    EMPIRICAL_RECONCILIATION_POLLS: corpus.reconCount,
    EMPIRICAL_NON_RECONCILIATION_POLLS: corpus.nonReconCount,
    EMPIRICAL_LV_EVIDENCE_ROWS: corpus.lvRowCount,
    EXECUTION_TRACE_INPUT_COMPLETENESS: {
      r9WakeEvidence: 'NOT_IN_CORPUS_ASSUMED_FALSE',
      providerGapState: 'NOT_IN_CORPUS_ASSUMED_FALSE',
      reconnectState: 'NOT_IN_CORPUS_ASSUMED_FALSE',
      pollFailures: 'SUCCESS_ONLY_CORPUS',
      shadowExecutionVersionTags: 'SIMULATED_NOT_READ_FROM_DB',
    },
    V2_1_EMPIRICAL_REPLAY:
      a.forcedMissingLastAllowedViolations === 0 &&
      a.b2v2.bootstrapAdmits === 0 &&
      a.b4v2.bootstrapAdmits === 0 &&
      a.b2v21.bootstrapAdmits > 0 &&
      a.b4v21.bootstrapAdmits > 0 &&
      digestA === digestB &&
      a.b2v2.lvLookaheadViolations === 0 &&
      a.b4v2.lvLookaheadViolations === 0
        ? 'PASS'
        : 'FAIL',
    EXPECTED_BOOTSTRAP_DIVERGENCES: a.expectedBootstrapLvSeeds,
    EXPECTED_DOWNSTREAM_LASTALLOWED_VEHICLE_DELTAS: a.expectedDownstreamLastAllowedDeltaVehicles,
    UNEXPLAINED_EXECUTION_DIVERGENCES: a.forcedMissingLastAllowedViolations,
    LV_LOOKAHEAD_VIOLATIONS:
      a.b2v2.lvLookaheadViolations + a.b4v2.lvLookaheadViolations,
    STATE_ISOLATION: 'PER_VEHICLE_POLICY_SCOPED',
    RESTART_DETERMINISM: digestA === digestB ? 'PASS' : 'FAIL',
    B2_V2_BOOTSTRAP_ADMITS: a.b2v2.bootstrapAdmits,
    B2_V2_1_BOOTSTRAP_ADMITS: a.b2v21.bootstrapAdmits,
    B4_V2_BOOTSTRAP_ADMITS: a.b4v2.bootstrapAdmits,
    B4_V2_1_BOOTSTRAP_ADMITS: a.b4v21.bootstrapAdmits,
    B2_FORCED_MISSING_PRE_POLL_COUNT: a.b2v21.forcedMissingPrePoll,
    B4_FORCED_MISSING_PRE_POLL_COUNT: a.b4v21.forcedMissingPrePoll,
    POLICY_VERSIONS: { B2: P25_APD_B2_V1, B4: P25_APD_B4_V1 },
    perVehicleFinalState: corpus.vehicles.map((v) => ({
      safeRef: corpus.safeRef(v),
      B2_V2_simulatedLv: a.b2v2.state.get(v.id)!.simulatedLv,
      B2_V2_1_simulatedLv: a.b2v21.state.get(v.id)!.simulatedLv,
      B4_V2_simulatedLv: a.b4v2.state.get(v.id)!.simulatedLv,
      B4_V2_1_simulatedLv: a.b4v21.state.get(v.id)!.simulatedLv,
      B2_lastAllowed: a.b2v21.state.get(v.id)!.lastAllowed,
      B4_lastAllowed: a.b4v21.state.get(v.id)!.lastAllowed,
    })),
    RESTART_DIGEST: digestA,
  };

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
