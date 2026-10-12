import type {
  PlatformOpsDiS4MonitoringHealth,
  PlatformOpsDiS4ProcessingState,
} from './platform-ops-di-s4.types';

export const PLATFORM_OPS_DI_S4_EXPECTED_BACKEND_REPLICAS = ['a', 'b'] as const;
export const PLATFORM_OPS_DI_S4_EXPECTED_RULE_COUNT = 15;

export interface S4MonitoringEvidence {
  prometheusAvailable: boolean;
  alertmanagerAvailable: boolean;
  globalKillReadable: boolean;
  metricsFresh: boolean | null;
  refreshError: boolean | null;
  rulesLoadedCount: number;
  expectedRuleCount: number;
  ruleHealthErrCount: number;
  schedulerLeaderCount: number | null;
  expectedReplicas: readonly string[];
  schedulerReplicasObserved: string[];
  dimoBudgetReplicasObserved: string[];
  dimoBudgetDisabledOnReplica: boolean;
  controlPlaneReadable: boolean | null;
  /** S4-scoped Alertmanager alerts only (DiV0S4*); excludes IAM and unrelated platform alerts. */
  s4FiringCriticalCount: number;
  s4FiringWarningCount: number;
}

export interface S4ProcessingInput {
  masterEnabled: boolean;
  globalKillState: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN';
  shadowPlaneEngaged: boolean | null;
}

/** S4 work processing: DISABLED (dormant/killed), ACTIVE (shadow engaged), or UNKNOWN (unreadable kill / ambiguous). */
export function computeS4ProcessingState(input: S4ProcessingInput): PlatformOpsDiS4ProcessingState {
  if (input.globalKillState === 'UNKNOWN') return 'UNKNOWN';
  if (!input.masterEnabled || input.globalKillState === 'KILLED') return 'DISABLED';
  if (input.shadowPlaneEngaged === true) return 'ACTIVE';
  if (input.shadowPlaneEngaged === false) return 'DISABLED';
  return 'UNKNOWN';
}

export function listS4MonitoringGaps(evidence: S4MonitoringEvidence): string[] {
  const gaps: string[] = [];
  if (!evidence.prometheusAvailable) gaps.push('prometheus_unavailable');
  if (!evidence.alertmanagerAvailable) gaps.push('alertmanager_unavailable');
  if (!evidence.globalKillReadable) gaps.push('global_kill_unreadable');
  if (evidence.metricsFresh === null) gaps.push('operational_metrics_freshness_unknown');
  if (evidence.metricsFresh === false) gaps.push('operational_metrics_stale');
  if (evidence.refreshError === true) gaps.push('operational_refresh_error');
  if (evidence.controlPlaneReadable === null) gaps.push('control_plane_readable_unknown');
  if (evidence.controlPlaneReadable === false) gaps.push('control_plane_unreadable');
  if (evidence.rulesLoadedCount < evidence.expectedRuleCount) {
    gaps.push(`prometheus_rules_incomplete_${evidence.rulesLoadedCount}_of_${evidence.expectedRuleCount}`);
  }
  if (evidence.ruleHealthErrCount > 0) gaps.push('prometheus_rule_health_err');
  if (evidence.schedulerLeaderCount === null) gaps.push('scheduler_leader_count_unknown');
  else if (evidence.schedulerLeaderCount !== 1) gaps.push('scheduler_leader_count_invalid');

  for (const replica of evidence.expectedReplicas) {
    if (!evidence.schedulerReplicasObserved.includes(replica)) {
      gaps.push(`scheduler_replica_missing_${replica}`);
    }
    if (!evidence.dimoBudgetReplicasObserved.includes(replica)) {
      gaps.push(`dimo_budget_replica_missing_${replica}`);
    }
  }
  if (evidence.dimoBudgetDisabledOnReplica) gaps.push('dimo_budget_disabled_on_replica');
  return gaps;
}

/**
 * Monitoring stack health for S4 — never HEALTHY without complete mandatory evidence.
 * IAM / unrelated alerts must not influence this (pass only DiV0S4* alert counts).
 */
export function computeS4MonitoringHealth(evidence: S4MonitoringEvidence): PlatformOpsDiS4MonitoringHealth {
  if (evidence.s4FiringCriticalCount > 0) return 'CRITICAL';
  if (evidence.refreshError === true) return 'CRITICAL';
  if (evidence.ruleHealthErrCount > 0) return 'CRITICAL';
  if (evidence.controlPlaneReadable === false) return 'CRITICAL';
  if (
    evidence.prometheusAvailable &&
    evidence.schedulerLeaderCount !== null &&
    evidence.schedulerLeaderCount !== 1
  ) {
    return 'CRITICAL';
  }
  if (evidence.dimoBudgetDisabledOnReplica) return 'CRITICAL';

  if (!evidence.prometheusAvailable) return 'UNKNOWN';
  if (evidence.metricsFresh === null) return 'UNKNOWN';
  if (!evidence.globalKillReadable) return 'UNKNOWN';
  if (evidence.controlPlaneReadable === null) return 'UNKNOWN';
  if (evidence.schedulerLeaderCount === null) return 'UNKNOWN';

  const schedulerMissing = evidence.expectedReplicas.some(
    (r) => !evidence.schedulerReplicasObserved.includes(r),
  );
  const dimoMissing = evidence.expectedReplicas.some(
    (r) => !evidence.dimoBudgetReplicasObserved.includes(r),
  );

  if (evidence.rulesLoadedCount === 0) return 'UNKNOWN';
  if (schedulerMissing && evidence.schedulerReplicasObserved.length === 0) return 'UNKNOWN';
  if (dimoMissing && evidence.dimoBudgetReplicasObserved.length === 0) return 'UNKNOWN';

  if (evidence.rulesLoadedCount < evidence.expectedRuleCount) return 'WARNING';
  if (!evidence.alertmanagerAvailable) return 'WARNING';
  if (evidence.metricsFresh === false) return 'WARNING';
  if (evidence.s4FiringWarningCount > 0) return 'WARNING';
  if (schedulerMissing || dimoMissing) return 'WARNING';

  if (evidence.metricsFresh !== true) return 'UNKNOWN';

  return 'HEALTHY';
}

export function isMetricsFresh(
  lastSuccessUnixtime: number | null,
  refreshError: boolean | null,
  staleAfterSeconds: number,
  nowUnix: number,
): boolean | null {
  if (refreshError === true) return false;
  if (lastSuccessUnixtime == null) return null;
  if (lastSuccessUnixtime <= 0) return false;
  const age = nowUnix - lastSuccessUnixtime;
  if (age > staleAfterSeconds) return false;
  return true;
}
