import type { EvaluationsKpiJumpSeverity } from './evaluations-prometheus.metrics';

/**
 * Classify unusual changes in published insight counts between runs.
 * Uses relative + absolute thresholds to avoid noise on small tenants.
 */
export function classifyInsightCountJump(
  previousCount: number,
  currentCount: number,
): EvaluationsKpiJumpSeverity {
  const delta = Math.abs(currentCount - previousCount);
  if (delta === 0) return 'none';

  if (previousCount === 0) {
    if (currentCount >= 20) return 'severe';
    if (currentCount >= 8) return 'moderate';
    return 'none';
  }

  const ratio = delta / previousCount;
  if (ratio >= 2 && delta >= 5) return 'severe';
  if (ratio >= 1 && delta >= 3) return 'moderate';
  return 'none';
}
