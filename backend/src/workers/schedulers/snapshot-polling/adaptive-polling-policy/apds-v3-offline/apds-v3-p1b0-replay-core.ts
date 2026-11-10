import { evaluateP25ApdB2V1Core, evaluateP25ApdB4V1Core } from '../p25-apd-policy-engine';
import {
  evaluateApdsV3OfflinePolicy,
  evaluateCanonicalBaselineSchedulerWouldPoll,
  buildP25ShadowInputFromOffline,
} from './apds-v3-offline-policy.evaluator';
import type { ApdsV3OfflinePolicyInput } from './apds-v3-offline.types';

export type ApdsV3ReplayEpochPoint = {
  decisionAtMs: number;
  organizationId: string;
  vehicleId: string;
  tierIntervalMs: number;
  input: ApdsV3OfflinePolicyInput;
};

export type ApdsV3ReplayAggregatorReport = {
  windowStartMs: number;
  windowEndMs: number;
  vehicleCount: number;
  decisionCount: number;
  /** Would have skipped physical poll vs canonical baseline at same tick */
  historicalSkipOpportunities: number;
  /** Estimated provider requests if baseline polled every eligible tick */
  baselinePhysicalRequests: number;
  /** Estimated if V3 offline candidate applied (projected — not realized) */
  v3ProjectedPhysicalRequests: number;
  b2WouldSkip: number;
  b4WouldSkip: number;
  b2b4IntersectionWouldSkip: number;
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
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx] ?? null;
}

function allowFromDecision(
  d: 'WOULD_POLL' | 'WOULD_SKIP' | 'FORCED_SAFETY_POLL' | 'INSUFFICIENT_EVIDENCE' | 'NOT_ASSESSABLE',
): boolean {
  return (
    d === 'WOULD_POLL' ||
    d === 'FORCED_SAFETY_POLL' ||
    d === 'INSUFFICIENT_EVIDENCE'
  );
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
  let baselinePhysical = 0;
  let v3Projected = 0;
  let historicalSkip = 0;
  let b2WouldSkip = 0;
  let b4WouldSkip = 0;
  let b2b4 = 0;
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

  for (const p of inWindow) {
    const baseline = evaluateCanonicalBaselineSchedulerWouldPoll({
      decisionAtMs: p.decisionAtMs,
      lastPhysicalPollMs: p.input.lastPhysicalPollMs,
      tierIntervalMs: p.tierIntervalMs,
    });
    if (baseline) baselinePhysical += 1;

    const v3 = evaluateApdsV3OfflinePolicy(p.input);
    const v3Poll = allowFromDecision(v3.decision);
    if (v3Poll) v3Projected += 1;

    if (baseline && !v3Poll) historicalSkip += 1;
    if (v3.decision === 'WOULD_SKIP') v3WouldSkip += 1;
    if (v3.decision === 'FORCED_SAFETY_POLL') forced += 1;
    if (v3.decision === 'INSUFFICIENT_EVIDENCE') insuf += 1;
    if (v3.decision === 'NOT_ASSESSABLE') na += 1;

    const shadow = buildP25ShadowInputFromOffline(p.input);
    const b2 = evaluateP25ApdB2V1Core(shadow);
    const b4 = evaluateP25ApdB4V1Core(shadow);
    if (b2.decision === 'WOULD_SKIP') b2WouldSkip += 1;
    if (b4.decision === 'WOULD_SKIP') b4WouldSkip += 1;
  if (b2.decision === 'WOULD_SKIP' && b4.decision === 'WOULD_SKIP') b2b4 += 1;

    if (
      v3.decision === 'WOULD_SKIP' &&
      p.input.lastLvProviderSourceMs != null &&
      p.decisionAtMs - p.input.lastLvProviderSourceMs > 3_600_000
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
    decisionCount: inWindow.length,
    historicalSkipOpportunities: historicalSkip,
    baselinePhysicalRequests: baselinePhysical,
    v3ProjectedPhysicalRequests: v3Projected,
    b2WouldSkip,
    b4WouldSkip,
    b2b4IntersectionWouldSkip: b2b4,
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
  };
}
