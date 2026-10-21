/**
 * Bounded Prometheus label keys for future wiring (S4F-1 does not register metrics in AppModule).
 * High-cardinality identifiers are explicitly forbidden.
 */
export const DI_V0_S4F_PROMETHEUS_LABEL_KEYS = [
  's4_work_status',
  's4_pipeline_registry_status',
  's4_anomaly_kind',
  's4_executor_liveness_signal',
] as const;

const FORBIDDEN_LABEL_SUBSTRINGS = [
  'organization',
  'vehicle',
  'trip',
  'work_item',
  'snapshot_hash',
  'pipeline_version',
  'pipeline_hash',
] as const;

export function assertBoundedPrometheusLabels(labels: Record<string, string>): void {
  for (const key of Object.keys(labels)) {
    const lower = key.toLowerCase();
    for (const forbidden of FORBIDDEN_LABEL_SUBSTRINGS) {
      if (lower.includes(forbidden)) {
        throw new Error(`DI_V0_S4F_METRIC_LABEL_FORBIDDEN:${key}`);
      }
    }
    if (!DI_V0_S4F_PROMETHEUS_LABEL_KEYS.includes(key as (typeof DI_V0_S4F_PROMETHEUS_LABEL_KEYS)[number])) {
      throw new Error(`DI_V0_S4F_METRIC_LABEL_UNKNOWN:${key}`);
    }
  }
}
