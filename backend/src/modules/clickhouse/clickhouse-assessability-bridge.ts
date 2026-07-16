import type { ClickHouseAnalysisHealth } from './clickhouse-analysis-degradation.types';
import { resolveHfAssessabilityDegradation } from './clickhouse-analysis-degradation';

export function buildTripAssessabilityClickHouseInput(
  health: ClickHouseAnalysisHealth,
): {
  hfUnavailable: boolean;
  providerError: boolean;
  limitReason: string | null;
} | null {
  const degradation = resolveHfAssessabilityDegradation(health);
  if (!degradation) return null;
  return {
    hfUnavailable: degradation.hfInsufficient,
    providerError: degradation.providerError,
    limitReason: degradation.limitReason,
  };
}
