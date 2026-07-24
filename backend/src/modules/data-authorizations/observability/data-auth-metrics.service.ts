import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { AUTHORIZATION_DECISION_ENGINE_VERSION } from '../authorization-decision-engine/authorization-decision.constants';
import { resolveEnforcementCoverageVersion } from '../enforcement-coverage-registry/enforcement-coverage-version.util';

export type DataAuthDecisionLabel = 'ALLOW' | 'DENY' | 'SHADOW_WOULD_DENY';

export type DataAuthReasonCategory =
  | 'policy_match'
  | 'no_policy'
  | 'resolver_error'
  | 'provider'
  | 'deny_switch'
  | 'dev_bypass'
  | 'invalid_request'
  | 'database'
  | 'other';

const PROVIDER_REASON_PREFIXES = [
  'PROVIDER_',
  'POLICY_REVOKED_PROVIDER',
  'PROVIDER_REVOKED_POLICY',
] as const;

const DENY_SWITCH_REASONS = new Set([
  'GLOBAL_DENY_SWITCH',
  'DENY_SWITCH_ACTIVE',
  'DENY_SWITCH_NOT_READY',
  'DENY_SWITCH_PROVIDER',
  'DENY_SWITCH_ORG',
  'DENY_SWITCH_VEHICLE',
  'DENY_SWITCH_BOOKING',
  'DENY_SWITCH_CUSTOMER',
  'DENY_SWITCH_STATION',
  'DENY_SWITCH_RESOURCE',
]);

/**
 * Low-cardinality Prometheus metrics for data authorization, enforcement, and privacy operations.
 * Never label with organizationId, userId, vehicleId, customerId, bookingId, or policy UUIDs.
 */
@Injectable()
export class DataAuthMetricsService {
  readonly decisionTotal: Counter<string>;
  readonly resolverErrorTotal: Counter<string>;
  readonly missingPolicyTotal: Counter<string>;
  readonly enforcementErrorTotal: Counter<string>;
  readonly providerConflictTotal: Counter<string>;
  readonly revocationFailedTotal: Counter<string>;
  readonly auditOutboxFailedTotal: Counter<string>;
  readonly auditDeadLetterTotal: Counter<string>;
  readonly queueErrorTotal: Counter<string>;
  readonly retentionErrorTotal: Counter<string>;
  readonly denySwitchPropagationTotal: Counter<string>;
  readonly policyCacheStaleTotal: Counter<string>;
  readonly unprotectedPathDetectedTotal: Counter<string>;

  readonly revocationInProgressTotal: Gauge<string>;
  readonly expiredPolicyTotal: Gauge<string>;
  readonly overdueReviewTotal: Gauge<string>;
  readonly overdueDpiaTotal: Gauge<string>;
  readonly unregisteredPathTotal: Gauge<string>;
  readonly workerVersionMismatch: Gauge<string>;
  readonly devBypassEnabled: Gauge<string>;
  readonly enforcementDisabled: Gauge<string>;
  readonly globalDenySwitchEnabled: Gauge<string>;
  readonly policyCacheEntries: Gauge<string>;
  readonly auditOutboxPendingTotal: Gauge<string>;

  readonly decisionLatencySeconds: Histogram<string>;
  readonly denySwitchPropagationLatencySeconds: Histogram<string>;

  readonly buildInfo: Gauge<string>;

  constructor(private readonly tripMetrics: TripMetricsService) {
    const register = this.tripMetrics.registry;

    this.decisionTotal = new Counter({
      name: 'data_auth_decision_total',
      help: 'Authorization decision outcomes',
      labelNames: ['decision', 'reason_category', 'source_system', 'action'],
      registers: [register],
    });

    this.resolverErrorTotal = new Counter({
      name: 'data_auth_resolver_error_total',
      help: 'Policy resolver failures during authorization decisions',
      labelNames: ['source_system'],
      registers: [register],
    });

    this.missingPolicyTotal = new Counter({
      name: 'data_auth_missing_policy_total',
      help: 'Denials due to missing or non-matching policy',
      labelNames: ['source_system', 'action'],
      registers: [register],
    });

    this.enforcementErrorTotal = new Counter({
      name: 'data_auth_enforcement_error_total',
      help: 'Enforcement adapter or coverage errors by domain',
      labelNames: ['domain'],
      registers: [register],
    });

    this.providerConflictTotal = new Counter({
      name: 'data_auth_provider_conflict_total',
      help: 'Provider grant vs policy contradictions detected',
      labelNames: ['source_system'],
      registers: [register],
    });

    this.revocationFailedTotal = new Counter({
      name: 'data_auth_revocation_failed_total',
      help: 'Revocation workflow terminal failures',
      labelNames: ['step'],
      registers: [register],
    });

    this.auditOutboxFailedTotal = new Counter({
      name: 'data_auth_audit_outbox_failed_total',
      help: 'Data authorization audit outbox retry scheduling',
      labelNames: ['event_kind'],
      registers: [register],
    });

    this.auditDeadLetterTotal = new Counter({
      name: 'data_auth_audit_dead_letter_total',
      help: 'Data authorization audit outbox dead-letter events',
      labelNames: ['event_kind'],
      registers: [register],
    });

    this.queueErrorTotal = new Counter({
      name: 'data_auth_queue_error_total',
      help: 'Revocation-related queue enqueue or processing errors',
      labelNames: ['queue'],
      registers: [register],
    });

    this.retentionErrorTotal = new Counter({
      name: 'data_auth_retention_error_total',
      help: 'Retention deletion job phase failures',
      labelNames: ['phase'],
      registers: [register],
    });

    this.denySwitchPropagationTotal = new Counter({
      name: 'data_auth_deny_switch_propagation_total',
      help: 'Deny-switch local apply and cross-instance propagation outcomes',
      labelNames: ['outcome'],
      registers: [register],
    });

    this.policyCacheStaleTotal = new Counter({
      name: 'data_auth_policy_cache_stale_total',
      help: 'Policy cache entries invalidated due to version mismatch or TTL',
      registers: [register],
    });

    this.unprotectedPathDetectedTotal = new Counter({
      name: 'data_auth_unprotected_path_detected_total',
      help: 'Productive processing paths without registered enforcement',
      labelNames: ['domain'],
      registers: [register],
    });

    this.revocationInProgressTotal = new Gauge({
      name: 'data_auth_revocation_in_progress_total',
      help: 'Active revocation workflows in non-terminal states',
      registers: [register],
    });

    this.expiredPolicyTotal = new Gauge({
      name: 'data_auth_expired_policy_total',
      help: 'Enforcement policies past validUntil not yet transitioned',
      registers: [register],
    });

    this.overdueReviewTotal = new Gauge({
      name: 'data_auth_overdue_review_total',
      help: 'Processing activities with overdue nextReviewDate',
      registers: [register],
    });

    this.overdueDpiaTotal = new Gauge({
      name: 'data_auth_overdue_dpia_total',
      help: 'Processing activities requiring DPIA review',
      registers: [register],
    });

    this.unregisteredPathTotal = new Gauge({
      name: 'data_auth_unregistered_path_total',
      help: 'Productive catalog paths missing from enforcement registry',
      registers: [register],
    });

    this.workerVersionMismatch = new Gauge({
      name: 'data_auth_worker_version_mismatch',
      help: '1 when worker policy engine version differs from expected',
      registers: [register],
    });

    this.devBypassEnabled = new Gauge({
      name: 'data_auth_dev_bypass_enabled',
      help: '1 when DATA_AUTH_DECISION_DEV_BYPASS=true (must be 0 in production)',
      registers: [register],
    });

    this.enforcementDisabled = new Gauge({
      name: 'data_auth_enforcement_disabled',
      help: '1 when decision enforcement is disabled',
      registers: [register],
    });

    this.globalDenySwitchEnabled = new Gauge({
      name: 'data_auth_global_deny_switch_enabled',
      help: '1 when DATA_AUTH_DECISION_GLOBAL_DENY=true',
      registers: [register],
    });

    this.policyCacheEntries = new Gauge({
      name: 'data_auth_policy_cache_entries',
      help: 'In-memory authorization decision cache entry count',
      registers: [register],
    });

    this.auditOutboxPendingTotal = new Gauge({
      name: 'data_auth_audit_outbox_pending_total',
      help: 'Pending data authorization audit outbox rows',
      registers: [register],
    });

    this.decisionLatencySeconds = new Histogram({
      name: 'data_auth_decision_latency_seconds',
      help: 'Authorization decision evaluation latency',
      labelNames: ['source_system', 'action'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [register],
    });

    this.denySwitchPropagationLatencySeconds = new Histogram({
      name: 'data_auth_deny_switch_propagation_latency_seconds',
      help: 'Deny-switch cross-instance propagation latency',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [register],
    });

    this.buildInfo = new Gauge({
      name: 'data_auth_build_info',
      help: 'Data authorization module build and engine version metadata (value always 1)',
      labelNames: ['engine_version', 'build_version', 'git_commit'],
      registers: [register],
    });

    this.publishBuildInfo();
  }

  publishBuildInfo(): void {
    const version = resolveEnforcementCoverageVersion();
    this.buildInfo.set(
      {
        engine_version: AUTHORIZATION_DECISION_ENGINE_VERSION,
        build_version: version.buildVersion ?? 'local',
        git_commit: version.gitCommit ?? 'unknown',
      },
      1,
    );
  }

  recordDecision(input: {
    decision: DataAuthDecisionLabel;
    reasonCode: string;
    sourceSystem: string;
    action: string;
  }): void {
    const reasonCategory = categorizeReasonCode(input.reasonCode);
    const sourceSystem = normalizeLabel(input.sourceSystem, 24, 'unknown');
    const action = normalizeLabel(input.action, 24, 'unknown');

    this.decisionTotal.inc({
      decision: input.decision,
      reason_category: reasonCategory,
      source_system: sourceSystem,
      action,
    });

    if (reasonCategory === 'no_policy') {
      this.missingPolicyTotal.inc({ source_system: sourceSystem, action });
    }
    if (reasonCategory === 'resolver_error' || reasonCategory === 'database') {
      this.resolverErrorTotal.inc({ source_system: sourceSystem });
    }
    if (reasonCategory === 'provider') {
      this.providerConflictTotal.inc({ source_system: sourceSystem });
    }
  }

  recordResolverError(sourceSystem: string): void {
    this.resolverErrorTotal.inc({
      source_system: normalizeLabel(sourceSystem, 24, 'unknown'),
    });
  }

  recordEnforcementError(domain: string): void {
    this.enforcementErrorTotal.inc({
      domain: normalizeLabel(domain, 32, 'unknown'),
    });
  }

  recordRevocationFailed(step = 'unknown'): void {
    this.revocationFailedTotal.inc({
      step: normalizeLabel(step, 32, 'unknown'),
    });
  }

  recordAuditOutboxFailed(eventKind: string): void {
    this.auditOutboxFailedTotal.inc({
      event_kind: normalizeLabel(eventKind, 48, 'UNKNOWN'),
    });
  }

  recordAuditDeadLetter(eventKind: string): void {
    this.auditDeadLetterTotal.inc({
      event_kind: normalizeLabel(eventKind, 48, 'UNKNOWN'),
    });
  }

  recordQueueError(queue: string): void {
    this.queueErrorTotal.inc({
      queue: normalizeLabel(queue, 48, 'unknown'),
    });
  }

  recordRetentionError(phase: string): void {
    this.retentionErrorTotal.inc({
      phase: normalizeLabel(phase, 32, 'unknown'),
    });
  }

  recordDenySwitchPropagation(outcome: string): void {
    this.denySwitchPropagationTotal.inc({
      outcome: normalizeLabel(outcome, 32, 'unknown'),
    });
  }

  observeDenySwitchPropagationLatencySeconds(seconds: number): void {
    if (Number.isFinite(seconds) && seconds >= 0) {
      this.denySwitchPropagationLatencySeconds.observe(seconds);
    }
  }

  recordPolicyCacheStale(count = 1): void {
    this.policyCacheStaleTotal.inc(count);
  }

  recordUnprotectedPath(domain: string): void {
    this.unprotectedPathDetectedTotal.inc({
      domain: normalizeLabel(domain, 32, 'unknown'),
    });
  }

  observeDecisionLatencySeconds(
    seconds: number,
    sourceSystem: string,
    action: string,
  ): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.decisionLatencySeconds.observe(
      {
        source_system: normalizeLabel(sourceSystem, 24, 'unknown'),
        action: normalizeLabel(action, 24, 'unknown'),
      },
      seconds,
    );
  }

  setRevocationInProgress(count: number): void {
    this.revocationInProgressTotal.set(count);
  }

  setExpiredPolicy(count: number): void {
    this.expiredPolicyTotal.set(count);
  }

  setOverdueReview(count: number): void {
    this.overdueReviewTotal.set(count);
  }

  setOverdueDpia(count: number): void {
    this.overdueDpiaTotal.set(count);
  }

  setUnregisteredPath(count: number): void {
    this.unregisteredPathTotal.set(count);
  }

  setWorkerVersionMismatch(mismatch: boolean): void {
    this.workerVersionMismatch.set(mismatch ? 1 : 0);
  }

  setDevBypassEnabled(enabled: boolean): void {
    this.devBypassEnabled.set(enabled ? 1 : 0);
  }

  setEnforcementDisabled(disabled: boolean): void {
    this.enforcementDisabled.set(disabled ? 1 : 0);
  }

  setGlobalDenySwitchEnabled(enabled: boolean): void {
    this.globalDenySwitchEnabled.set(enabled ? 1 : 0);
  }

  setPolicyCacheEntries(count: number): void {
    this.policyCacheEntries.set(count);
  }

  setAuditOutboxPending(count: number): void {
    this.auditOutboxPendingTotal.set(count);
  }
}

export function categorizeReasonCode(reasonCode: string): DataAuthReasonCategory {
  const code = reasonCode.trim().toUpperCase();
  if (!code) return 'other';
  if (code === 'POLICY_MATCH') return 'policy_match';
  if (code === 'NO_MATCHING_POLICY' || code === 'POLICY_UNCLEAR') return 'no_policy';
  if (code === 'RESOLVER_ERROR') return 'resolver_error';
  if (code === 'DATABASE_ERROR') return 'database';
  if (code === 'DEVELOPMENT_BYPASS') return 'dev_bypass';
  if (
    code.startsWith('REQUEST_') ||
    code.startsWith('MISSING_') ||
    code === 'UNKNOWN_DATA_CATEGORY' ||
    code === 'UNKNOWN_PROCESSOR' ||
    code === 'UNKNOWN_ACTION'
  ) {
    return 'invalid_request';
  }
  if (DENY_SWITCH_REASONS.has(code) || code.includes('DENY_SWITCH')) {
    return 'deny_switch';
  }
  if (PROVIDER_REASON_PREFIXES.some((prefix) => code.startsWith(prefix) || code.includes(prefix))) {
    return 'provider';
  }
  return 'other';
}

function normalizeLabel(value: string, maxLength: number, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const normalized = trimmed.replace(/[^a-zA-Z0-9_:-]+/g, '_').slice(0, maxLength);
  return normalized || fallback;
}
