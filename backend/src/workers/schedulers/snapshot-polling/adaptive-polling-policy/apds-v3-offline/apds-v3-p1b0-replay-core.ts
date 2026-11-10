import { evaluateP25ApdB2V1Core, evaluateP25ApdB4V1Core } from '../p25-apd-policy-engine';
import {
  evaluateApdsV3OfflinePolicy,
  buildP25ShadowInputFromOffline,
  evaluateOfflineBaselinePollDueFromPolicyInput,
} from './apds-v3-offline-policy.evaluator';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';
import {
  classifyV3ReplayPhysicalAccounting,
  physicalRequestDedupKey,
  type PhysicalRequestOutcomeClass,
} from './apds-v3-replay-accounting.v1';
import { evaluateFrozenB2B4Intersection } from './p25-apd-b2b4-intersection.v1';
import { APDS_V3_BASELINE_AUTHORITY } from './apds-v3-baseline-poll-due.adapter';

export type ApdsV3ReplayEpochPoint = {
  decisionAtMs: number;
  organizationId: string;
  vehicleId: string;
  tierIntervalMs: number;
  physicalRequestId?: string | null;
  input: ApdsV3OfflinePolicyInput;
};

export type ApdsV3ReplayAggregatorReport = {
  windowStartMs: number;
  windowEndMs: number;
  vehicleCount: number;
  decisionTickCount: number;
  baselineEligiblePhysicalOpportunities: number;
  dedupedBaselinePhysicalOpportunities: number;
  /** Hypothetical only — not realized savings */
  hypotheticalIncrementalSkipSavings: number;
  v3ProjectedPhysicalPolls: number;
  v3AdditionalPollsVsBaseline: number;
  b2WouldSkip: number;
  b4WouldSkip: number;
  b2b4JointSkipCandidate: number;
  v3WouldSkip: number;
  forcedSafetyPoll: number;
  insufficientEvidence: number;
  notAssessable: number;
  strictLvAdvancesPotentiallyMissed: number;
  p2cTopLevelAdvancesAtRisk: number;
  tripSafetyViolations: number;
  consumerFreshnessViolations: number;
  ksMx2024ProviderErrorTicks: number;
  staleP50Ms: number | null;
  staleP95Ms: number | null;
  staleP99Ms: number | null;
  baselineAuthority: typeof APDS_V3_BASELINE_AUTHORITY;
  outcomeClassCounts: Partial<Record<PhysicalRequestOutcomeClass, number>>;
  disclaimer: string;
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? null;
}

/** Deterministic offline replay — no counterfactual DIMO responses. */
export function aggregateApdsV3ReplayPoints(
  points: ApdsV3ReplayEpochPoint[],
  window: { startMs: number; endMs: number },
): ApdsV3ReplayAggregatorReport {
  const inWindow = points.filter(
    (p) => p.decisionAtMs >= window.startMs && p.decisionAtMs <= window.endMs,
  );
  const vehicleIds = new Set(inWindow.map((p) => `${p.organizationId}:${p.vehicleId}`));
  const seenBaselineKeys = new Set<string>();

  let baselineEligible = 0;
  let dedupedBaseline = 0;
  let hypotheticalSkip = 0;
  let v3Projected = 0;
  let v3Additional = 0;
  let b2WouldSkip = 0;
  let b4WouldSkip = 0;
  let b2b4Joint = 0;
  let v3WouldSkip = 0;
  let forced = 0;
  let insuf = 0;
  let na = 0;
  let lvMiss = 0;
  let p2cRisk = 0;
  let tripViol = 0;
  let freshViol = 0;
  let ksMx = 0;
  const staleness: number[] = [];
  const outcomeClassCounts: Partial<Record<PhysicalRequestOutcomeClass, number>> = {};

  for (const p of inWindow) {
    const baselineDue = evaluateOfflineBaselinePollDueFromPolicyInput(
      p.input,
      p.tierIntervalMs,
    );

    if (baselineDue) {
      baselineEligible += 1;
      const dedupeKey = physicalRequestDedupKey({
        organizationId: p.organizationId,
        vehicleId: p.vehicleId,
        physicalRequestId: p.physicalRequestId,
        decisionAtMs: p.decisionAtMs,
      });
      if (!seenBaselineKeys.has(dedupeKey)) {
        seenBaselineKeys.add(dedupeKey);
        dedupedBaseline += 1;
      }
    }

    const v3 = evaluateApdsV3OfflinePolicy(p.input);
    const shadow = buildP25ShadowInputFromOffline(p.input);
    const b2 = evaluateP25ApdB2V1Core(shadow);
    const b4 = evaluateP25ApdB4V1Core(shadow);
    const joint = evaluateFrozenB2B4Intersection(b2, b4);

    const accounting = classifyV3ReplayPhysicalAccounting({
      baselineDue,
      v3,
      b2,
      b4,
    });
    outcomeClassCounts[accounting.outcomeClass] =
      (outcomeClassCounts[accounting.outcomeClass] ?? 0) + 1;

    if (accounting.countsTowardProjectedPhysicalPoll) {
      v3Projected += 1;
    }

    if (baselineDue && accounting.countsTowardProjectedPhysicalPoll && v3.decision === 'FORCED_SAFETY_POLL') {
      v3Additional += 1;
    }
    if (baselineDue && !accounting.countsTowardProjectedPhysicalPoll && v3.decision === 'WOULD_SKIP') {
      v3Additional -= 1;
    }

    if (accounting.countsTowardHypotheticalSkipSavings) {
      hypotheticalSkip += 1;
    }

    if (b2.decision === 'WOULD_SKIP') b2WouldSkip += 1;
    if (b4.decision === 'WOULD_SKIP') b4WouldSkip += 1;
    if (joint.kind === 'JOINT_SKIP_CANDIDATE') b2b4Joint += 1;

    if (v3.decision === 'WOULD_SKIP') v3WouldSkip += 1;
    if (v3.decision === 'FORCED_SAFETY_POLL') forced += 1;
    if (v3.decision === 'INSUFFICIENT_EVIDENCE') insuf += 1;
    if (v3.decision === 'NOT_ASSESSABLE') na += 1;

    if (
      v3.decision === 'WOULD_SKIP' &&
      p.input.lastLvProviderSourceMs != null &&
      p.decisionAtMs - p.input.lastLvProviderSourceMs >
        (p.input.excludeFromOptimizationCalibration ? 0 : 3_600_000)
    ) {
      lvMiss += 1;
    }
    if (v3.decision === 'WOULD_SKIP' && p.input.p2cTopLevelAdvanceKnown) p2cRisk += 1;
    if (p.input.tripFsmState === 'ACTIVE' && v3.decision === 'WOULD_SKIP') tripViol += 1;
    if (v3.decision === 'WOULD_SKIP' && v3.hardSafetyTriggered) freshViol += 1;

    if (p.input.lastLvProviderSourceMs != null) {
      staleness.push(Math.max(0, p.decisionAtMs - p.input.lastLvProviderSourceMs));
    }
    if (p.input.excludeFromOptimizationCalibration && p.input.providerErrorRecent) {
      ksMx += 1;
    }
  }

  staleness.sort((a, b) => a - b);
  return {
    windowStartMs: window.startMs,
    windowEndMs: window.endMs,
    vehicleCount: vehicleIds.size,
    decisionTickCount: inWindow.length,
    baselineEligiblePhysicalOpportunities: baselineEligible,
    dedupedBaselinePhysicalOpportunities: dedupedBaseline,
    hypotheticalIncrementalSkipSavings: hypotheticalSkip,
    v3ProjectedPhysicalPolls: v3Projected,
    v3AdditionalPollsVsBaseline: v3Additional,
    b2WouldSkip,
    b4WouldSkip,
    b2b4JointSkipCandidate: b2b4Joint,
    v3WouldSkip,
    forcedSafetyPoll: forced,
    insufficientEvidence: insuf,
    notAssessable: na,
    strictLvAdvancesPotentiallyMissed: lvMiss,
    p2cTopLevelAdvancesAtRisk: p2cRisk,
    tripSafetyViolations: tripViol,
    consumerFreshnessViolations: freshViol,
    ksMx2024ProviderErrorTicks: ksMx,
    staleP50Ms: percentile(staleness, 0.5),
    staleP95Ms: percentile(staleness, 0.95),
    staleP99Ms: percentile(staleness, 0.99),
    baselineAuthority: APDS_V3_BASELINE_AUTHORITY,
    outcomeClassCounts,
    disclaimer:
      'PROJECTED_AND_HYPOTHETICAL_COUNTS_NOT_REALIZED_SAVINGS_NO_COUNTERFACTUAL_DIMO_RESPONSE',
  };
}
