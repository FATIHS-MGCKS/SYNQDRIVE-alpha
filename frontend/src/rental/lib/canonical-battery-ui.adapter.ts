import type {
  BatteryHealthStatus,
  BatteryHealthSummary,
  CanonicalBatteryDto,
} from '../../lib/api';

export type CanonicalBatteryUiSeverity =
  | 'good'
  | 'watch'
  | 'warning'
  | 'critical'
  | 'unknown';

function normalizeStatus(status: string | null | undefined): string {
  return (status ?? '').trim().toUpperCase();
}

export function readCanonicalBattery(
  summary: BatteryHealthSummary | null | undefined,
): CanonicalBatteryDto | null {
  return summary?.canonical ?? null;
}

export function resolveCanonicalLvHealthStatus(
  summary: BatteryHealthSummary | null | undefined,
): BatteryHealthStatus | null {
  const status = summary?.lv?.healthStatus ?? null;
  if (status === 'UNSUPPORTED') return 'UNKNOWN';
  return status;
}

export function resolveCanonicalEstimatedHealthScore(
  summary: BatteryHealthSummary | null | undefined,
): number | null {
  const canonical = readCanonicalBattery(summary);
  if (summary?.lv?.publicationState === 'INITIAL_CALIBRATION') return null;
  return (
    summary?.lv?.estimatedLvHealthScore?.value ??
    summary?.lv?.estimatedHealth?.scorePct ??
    canonical?.lv.assessment?.estimatedHealthScore ??
    null
  );
}

export function resolveCanonicalBatteryUiSeverity(
  summary: BatteryHealthSummary | null | undefined,
  rentalBatteryState?: string | null,
): CanonicalBatteryUiSeverity {
  const aggregate = resolveCanonicalLvHealthStatus(summary);
  if (rentalBatteryState === 'critical' || aggregate === 'CRITICAL') return 'critical';
  if (aggregate === 'WARNING') return 'warning';
  if (aggregate === 'WATCH') return 'watch';
  if (aggregate === 'GOOD') return 'good';
  return 'unknown';
}

export function resolveCanonicalHvHealthStatus(
  summary: BatteryHealthSummary | null | undefined,
): BatteryHealthStatus | null {
  return summary?.hv?.healthStatus ?? null;
}

export function resolveCanonicalHvSohPercent(
  summary: BatteryHealthSummary | null | undefined,
): number | null {
  return (
    summary?.canonical?.hv?.providerSoh.percent ??
    summary?.canonical?.liveState.hv?.values.providerSohPercent ??
    summary?.hv?.sohPct ??
    null
  );
}

export function mapCanonicalBatteryUiSeverityToScore(
  severity: CanonicalBatteryUiSeverity,
  estimatedScore: number | null,
): number {
  if (estimatedScore != null) return estimatedScore;
  switch (severity) {
    case 'critical':
      return 15;
    case 'warning':
      return 45;
    case 'watch':
      return 65;
    case 'good':
      return 85;
    default:
      return 0;
  }
}

export function isCanonicalBatteryTracked(
  summary: BatteryHealthSummary | null | undefined,
): boolean {
  const canonical = readCanonicalBattery(summary);
  const hasLiveVoltage =
    canonical?.liveState.lv.values.voltageV != null ||
    summary?.lv?.telemetry?.voltageV != null;
  return resolveCanonicalEstimatedHealthScore(summary) != null || hasLiveVoltage;
}

export function canonicalHvStatusColor(
  status: BatteryHealthStatus | null | undefined,
): string {
  switch (normalizeStatus(status ?? undefined)) {
    case 'GOOD':
      return 'var(--health-good)';
    case 'WATCH':
      return 'var(--health-watch)';
    case 'WARNING':
      return 'var(--health-warning)';
    case 'CRITICAL':
      return 'var(--health-critical)';
    default:
      return 'var(--muted-foreground)';
  }
}
