import { Registry } from 'prom-client';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  DataAuthMetricsService,
  categorizeReasonCode,
} from './data-auth-metrics.service';

describe('DataAuthMetricsService', () => {
  let metrics: DataAuthMetricsService;
  let registry: Registry;

  beforeEach(() => {
    registry = new Registry();
    const tripMetrics = { registry } as TripMetricsService;
    metrics = new DataAuthMetricsService(tripMetrics);
  });

  it('exposes required data-auth metrics without high-cardinality labels', async () => {
    metrics.recordDecision({
      decision: 'DENY',
      reasonCode: 'NO_MATCHING_POLICY',
      sourceSystem: 'DIMO',
      action: 'INGEST',
    });
    metrics.recordResolverError('DIMO');
    metrics.recordEnforcementError('trip_location');
    metrics.recordRevocationFailed('revoke_provider');
    metrics.recordAuditOutboxFailed('AUTHORIZATION_DECISION');
    metrics.recordAuditDeadLetter('AUTHORIZATION_DECISION');
    metrics.recordQueueError('trip_tracking');
    metrics.recordRetentionError('deletion_job');
    metrics.recordDenySwitchPropagation('propagation_received');
    metrics.observeDenySwitchPropagationLatencySeconds(0.25);
    metrics.recordPolicyCacheStale();
    metrics.recordUnprotectedPath('telemetry_ingest');
    metrics.observeDecisionLatencySeconds(0.05, 'DIMO', 'READ');
    metrics.setRevocationInProgress(2);
    metrics.setExpiredPolicy(1);
    metrics.setOverdueReview(3);
    metrics.setOverdueDpia(1);
    metrics.setUnregisteredPath(0);
    metrics.setWorkerVersionMismatch(false);
    metrics.setDevBypassEnabled(false);
    metrics.setEnforcementDisabled(false);
    metrics.setGlobalDenySwitchEnabled(false);
    metrics.setPolicyCacheEntries(10);
    metrics.setAuditOutboxPending(0);

    const text = await registry.metrics();
    expect(text).toContain('data_auth_decision_total');
    expect(text).toContain('data_auth_resolver_error_total');
    expect(text).toContain('data_auth_missing_policy_total');
    expect(text).toContain('data_auth_enforcement_error_total');
    expect(text).toContain('data_auth_provider_conflict_total');
    expect(text).toContain('data_auth_revocation_failed_total');
    expect(text).toContain('data_auth_audit_outbox_failed_total');
    expect(text).toContain('data_auth_audit_dead_letter_total');
    expect(text).toContain('data_auth_queue_error_total');
    expect(text).toContain('data_auth_retention_error_total');
    expect(text).toContain('data_auth_deny_switch_propagation_total');
    expect(text).toContain('data_auth_policy_cache_stale_total');
    expect(text).toContain('data_auth_unprotected_path_detected_total');
    expect(text).toContain('data_auth_decision_latency_seconds');
    expect(text).toContain('data_auth_deny_switch_propagation_latency_seconds');
    expect(text).toContain('data_auth_revocation_in_progress_total');
    expect(text).toContain('data_auth_expired_policy_total');
    expect(text).toContain('data_auth_overdue_review_total');
    expect(text).toContain('data_auth_overdue_dpia_total');
    expect(text).toContain('data_auth_unregistered_path_total');
    expect(text).toContain('data_auth_worker_version_mismatch');
    expect(text).toContain('data_auth_dev_bypass_enabled');
    expect(text).toContain('data_auth_build_info');
    expect(text).not.toMatch(/organizationId|vehicleId|customerId|userId/);
  });

  it('categorizes reason codes into bounded buckets', () => {
    expect(categorizeReasonCode('NO_MATCHING_POLICY')).toBe('no_policy');
    expect(categorizeReasonCode('PROVIDER_GRANT_POLICY_CONTRADICTION')).toBe('provider');
    expect(categorizeReasonCode('DENY_SWITCH_ACTIVE')).toBe('deny_switch');
    expect(categorizeReasonCode('RESOLVER_ERROR')).toBe('resolver_error');
  });
});
