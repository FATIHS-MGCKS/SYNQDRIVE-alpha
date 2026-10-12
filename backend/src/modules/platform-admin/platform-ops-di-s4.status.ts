import type {
  PlatformOpsDiS4OperationalMode,
  PlatformOpsDiS4OperationalStatus,
} from './platform-ops-di-s4.types';

export interface PlatformOpsDiS4StatusComputeInput {
  masterEnabled: boolean;
  globalKillState: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN';
  prometheusAvailable: boolean;
  metricsFresh: boolean | null;
  refreshError: boolean | null;
  s4FiringCriticalCount: number;
  s4FiringWarningCount: number;
  ruleHealthErrCount: number;
  schedulerLeaderCount: number | null;
  shadowPlaneEngaged: boolean | null;
}

export function computePlatformOpsDiS4OperationalMode(input: {
  masterEnabled: boolean;
  globalKillState: 'KILLED' | 'NOT_KILLED' | 'UNKNOWN';
  shadowPlaneEngaged: boolean | null;
}): PlatformOpsDiS4OperationalMode {
  if (!input.masterEnabled || input.globalKillState === 'KILLED') {
    return 'paused';
  }
  if (input.shadowPlaneEngaged === true) return 'active';
  if (input.shadowPlaneEngaged === false) return 'paused';
  return 'unknown';
}

/** Never returns HEALTHY when Prometheus is unavailable or metrics freshness is unknown/stale. */
export function computePlatformOpsDiS4OperationalStatus(
  input: PlatformOpsDiS4StatusComputeInput,
): PlatformOpsDiS4OperationalStatus {
  if (input.s4FiringCriticalCount > 0 || input.refreshError === true || input.ruleHealthErrCount > 0) {
    return 'CRITICAL';
  }

  if (!input.masterEnabled || input.globalKillState === 'KILLED') {
    return 'DISABLED';
  }

  if (!input.prometheusAvailable || input.metricsFresh === null) {
    return 'UNKNOWN';
  }

  if (!input.metricsFresh || input.s4FiringWarningCount > 0 || input.schedulerLeaderCount !== 1) {
    return 'WARNING';
  }

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
