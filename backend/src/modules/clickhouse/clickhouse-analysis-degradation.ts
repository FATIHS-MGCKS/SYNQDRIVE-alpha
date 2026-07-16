import type { DrivingAnalysisStageKey } from '@prisma/client';
import type {
  ClickHouseAnalysisHealth,
  ClickHouseAnalysisHealthStatus,
  HfAssessabilityDegradation,
} from './clickhouse-analysis-degradation.types';
import {
  CLICKHOUSE_HF_DEPENDENT_ANALYSIS_STAGES,
  CLICKHOUSE_INDEPENDENT_ANALYSIS_STAGES,
} from './clickhouse-analysis-degradation.types';

export function isClickHouseReachableForAnalysis(
  health: ClickHouseAnalysisHealth,
): boolean {
  return health.configured && health.reachable && health.status === 'available';
}

/**
 * Returns structured HF degradation when ClickHouse is not usable for analysis reads.
 * Never maps outage to "unremarkable" — callers must surface PROVIDER_ERROR or INSUFFICIENT_DATA.
 */
export function resolveHfAssessabilityDegradation(
  health: ClickHouseAnalysisHealth,
): HfAssessabilityDegradation | null {
  if (isClickHouseReachableForAnalysis(health)) {
    return null;
  }

  if (!health.configured) {
    return {
      providerError: false,
      hfInsufficient: true,
      assessabilityStatus: 'INSUFFICIENT_DATA',
      reasonCodes: ['HF_PROVIDER_ERROR'],
      limitReason: 'CLICKHOUSE_DISABLED',
    };
  }

  const providerError =
    health.status === 'circuit_open' ||
    health.status === 'timeout' ||
    health.status === 'degraded';

  const reasonCodes: HfAssessabilityDegradation['reasonCodes'] = providerError
    ? ['CLICKHOUSE_UNAVAILABLE', 'HF_PROVIDER_ERROR', 'PROVIDER_ERROR']
    : ['CLICKHOUSE_UNAVAILABLE', 'HF_PROVIDER_ERROR'];

  if (health.status === 'circuit_open') {
    reasonCodes.unshift('CLICKHOUSE_CIRCUIT_OPEN');
  }
  if (health.status === 'timeout') {
    reasonCodes.unshift('CLICKHOUSE_TIMEOUT');
  }

  return {
    providerError,
    hfInsufficient: true,
    assessabilityStatus: providerError ? 'PROVIDER_ERROR' : 'INSUFFICIENT_DATA',
    reasonCodes,
    limitReason: mapLimitReason(health.status),
  };
}

function mapLimitReason(status: ClickHouseAnalysisHealthStatus): string {
  switch (status) {
    case 'circuit_open':
      return 'CLICKHOUSE_CIRCUIT_OPEN';
    case 'timeout':
      return 'CLICKHOUSE_TIMEOUT';
    case 'degraded':
      return 'CLICKHOUSE_UNAVAILABLE';
    case 'disabled':
      return 'CLICKHOUSE_DISABLED';
    default:
      return 'CLICKHOUSE_UNAVAILABLE';
  }
}

export function canProceedAnalysisStage(
  stageKey: DrivingAnalysisStageKey,
  health: ClickHouseAnalysisHealth,
): { proceed: boolean; degradation: HfAssessabilityDegradation | null } {
  if (CLICKHOUSE_INDEPENDENT_ANALYSIS_STAGES.has(stageKey)) {
    return { proceed: true, degradation: null };
  }

  if (!CLICKHOUSE_HF_DEPENDENT_ANALYSIS_STAGES.has(stageKey)) {
    return { proceed: true, degradation: null };
  }

  const degradation = resolveHfAssessabilityDegradation(health);
  if (!degradation) {
    return { proceed: true, degradation: null };
  }

  // HF-dependent stages still run when native/route paths are independent,
  // but must carry explicit degradation — never silent "unremarkable".
  return { proceed: true, degradation };
}

export function buildLegacyAssessabilityForClickHouseOutage(
  degradation: HfAssessabilityDegradation,
): {
  analysisAssessability: 'NOT_ASSESSABLE' | 'LIMITED';
  analysisLimitReason: string;
  shortTermMisuseAssessable: false;
  hfInsufficientForAbuse: true;
} {
  return {
    analysisAssessability: degradation.providerError ? 'NOT_ASSESSABLE' : 'LIMITED',
    analysisLimitReason: degradation.limitReason,
    shortTermMisuseAssessable: false,
    hfInsufficientForAbuse: true,
  };
}
