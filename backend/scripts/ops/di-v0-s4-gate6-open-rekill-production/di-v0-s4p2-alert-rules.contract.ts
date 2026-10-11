/**
 * EXP021-S4P2 — machine-readable catalog of Prometheus alert rules in alerts-di-s4.yml.
 * Used by offline contract tests (no promtool required in CI).
 */
export type DiV0S4AlertSeverity = 'info' | 'warning' | 'critical';

export interface DiV0S4PrometheusAlertRule {
  alert: string;
  severity: DiV0S4AlertSeverity;
  /** Primary metric families referenced by expr (documentation / contract tests). */
  metricFamilies: readonly string[];
}

export const DI_V0_S4P2_PROMETHEUS_ALERT_RULES: readonly DiV0S4PrometheusAlertRule[] = [
  {
    alert: 'DiV0S4RuntimeConfigAttestationReplicaDrift',
    severity: 'critical',
    metricFamilies: [
      'synqdrive_di_v0_s4_activity_signal',
      'synqdrive_di_v0_s4_runtime_config_attestation_info',
    ],
  },
  {
    alert: 'DiV0S4SchedulerLeaderElectionBroken',
    severity: 'critical',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_scheduler_leader_status'],
  },
  {
    alert: 'DiV0S4GlobalKillOpen',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_global_not_killed'],
  },
  {
    alert: 'DiV0S4AllowlistTenantViolation',
    severity: 'critical',
    metricFamilies: [
      'synqdrive_di_v0_s4_activity_signal',
      'synqdrive_di_v0_s4_allowlist_violation_work_items',
    ],
  },
  {
    alert: 'DiV0S4ExpiredLeasesPersistent',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_di_v0_s4_expired_leased_work_items'],
  },
  {
    alert: 'DiV0S4AttemptsExhausted',
    severity: 'critical',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_di_v0_s4_attempts_exhausted_work_items'],
  },
  {
    alert: 'DiV0S4EvidencePinInconsistent',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_di_v0_s4_pin_required_missing_work_items'],
  },
  {
    alert: 'DiV0S4ControlPlaneUnreadable',
    severity: 'critical',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_di_v0_s4_control_plane_readable'],
  },
  {
    alert: 'DiV0S4DimoBudgetDisabledWhileStaged',
    severity: 'critical',
    metricFamilies: ['synqdrive_di_v0_s4_runtime_config_attestation_info', 'synqdrive_dimo_global_budget_enabled'],
  },
  {
    alert: 'DiV0S4DimoBudgetCooldownSustained',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_dimo_global_budget_cooldown_active'],
  },
  {
    alert: 'DiV0S4DimoPostTripAcquireTimeouts',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_dimo_acquire_timeout_total'],
  },
  {
    alert: 'DiV0S4DiscoverySchedulerStale',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_runtime_config_attestation_info', 'synqdrive_scheduler_tick_total'],
  },
  {
    alert: 'DiV0S4FailedTerminalWorkItems',
    severity: 'warning',
    metricFamilies: ['synqdrive_di_v0_s4_activity_signal', 'synqdrive_di_v0_s4_work_items'],
  },
] as const;

/** CRITICAL alerts route via existing Alertmanager receivers (synqdrive-critical / escalation). */
export const DI_V0_S4P2_CRITICAL_ALERT_RESPONSE_ROUTE =
  'Alertmanager template receivers synqdrive-critical + synqdrive-escalation (email/Slack per alertmanager.env); containment remains manual EMERGENCY_REKILL — no automatic rekill in application code.';
