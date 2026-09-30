import { DimoProviderBudgetError, DimoRateLimitedError } from '@modules/dimo/provider-budget/dimo-http-error.util';
import { classifyDiV0PositionTransportError } from '../../position-acquisition/di-v0-position-errors';
import { DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1 } from '../di-v0-s4f-observability-contract';
import { evaluateDiV0S4fTinyActivationReadiness, frozenTinyActivationGateKeys } from '../di-v0-s4f-activation-readiness';
import { assertBoundedPrometheusLabels } from '../di-v0-s4f-metric-labels';
import { auditDiV0S4ProviderBackpressure } from '../di-v0-s4f-provider-backpressure-audit';
import { evaluateDiV0S4fExecutorLiveness } from '../di-v0-s4f-executor-liveness';
import { DiV0S4ExecutorRegistry } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND } from '../di-v0-s4f-operational-aggregates';

describe('DI V0 S4F unit', () => {
  it('F25 empty input fails every required Tiny Activation gate closed', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({});
    expect(r.finalState).toBe('NOT_READY');
    expect(r.tinyActivationReady).toBe(false);
    for (const key of frozenTinyActivationGateKeys()) {
      expect(r[key as keyof typeof r]).not.toBe('SATISFIED');
    }
  });

  it('F26 replay evidence missing => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.replayDeserializerGate).toBe('UNKNOWN');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F27 snapshot-rehash evidence missing => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.snapshotRehashGate).toBe('UNKNOWN');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F16-F19 activation gates fail closed without explicit evidence', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({});
    expect(r.replayDeserializerGate).toBe('UNKNOWN');
    expect(r.snapshotRehashGate).toBe('UNKNOWN');
    expect(r.providerBackpressureGate).toBe('UNKNOWN');
    expect(r.locationRetentionGovernanceGate).toBe('UNKNOWN');
    expect(r.explicitOperatorAuthorizationGate).toBe('UNKNOWN');
  });

  it('F17 provider backpressure OPEN => NOT_READY', () => {
    const audit = auditDiV0S4ProviderBackpressure();
    expect(audit.gapStatus).toBe('OPEN_CONFIRMED');
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
      providerBackpressureGap: 'OPEN',
    });
    expect(r.providerBackpressureGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F18 location governance absent => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      explicitOperatorAuthorization: 'GRANTED',
      locationRetentionGovernanceNote: 'ABSENT',
    });
    expect(r.locationRetentionGovernanceGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F19 explicit operator authorization absent => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
    });
    expect(r.explicitOperatorAuthorizationGate).toBe('UNKNOWN');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('all frozen Tiny Activation gates explicitly satisfied => READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.finalState).toBe('READY');
    expect(r.tinyActivationReady).toBe(true);
    expect(Object.keys(r)).not.toContain('nativeReadinessGate');
  });

  it('F15 high-cardinality IDs absent from metric label schema', () => {
    expect(() => assertBoundedPrometheusLabels({ s4_work_status: 'PENDING' })).not.toThrow();
    expect(() => assertBoundedPrometheusLabels({ organization_id: 'x' })).toThrow(/FORBIDDEN/);
  });

  it('F21 ACTIVE pipeline with no global executor signal reported honestly', () => {
    const registry = new DiV0S4ExecutorRegistry();
    const l = evaluateDiV0S4fExecutorLiveness(1, registry);
    expect(l.globalExecutorLivenessAuthorityPresent).toBe(false);
    expect(l.signal).toBe('LOCAL_REPLICA_REGISTRY_ONLY');
    expect(l.localExecutorReady).toBe(false);
  });

  it('F36 operational aggregate boundedness classification truthful', () => {
    expect(DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND).toBe('FULL_TABLE_AGGREGATE');
  });

  it('observability contract version is stable', () => {
    expect(DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1).toBe('DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1');
  });

  it('provider budget REDIS_UNAVAILABLE maps to retryable PROVIDER_BUDGET_UNAVAILABLE', () => {
    const failure = classifyDiV0PositionTransportError(
      new DimoProviderBudgetError('Redis unavailable', 'REDIS_UNAVAILABLE', 'POST_TRIP_ENRICHMENT'),
    );
    expect(failure.failureClass).toBe('PROVIDER_BUDGET_UNAVAILABLE');
    expect(failure.retryable).toBe(true);
  });

  it('provider budget ACQUIRE_TIMEOUT maps to retryable PROVIDER_BUDGET_UNAVAILABLE', () => {
    const failure = classifyDiV0PositionTransportError(
      new DimoProviderBudgetError('timeout', 'ACQUIRE_TIMEOUT', 'POST_TRIP_ENRICHMENT'),
    );
    expect(failure.failureClass).toBe('PROVIDER_BUDGET_UNAVAILABLE');
    expect(failure.retryable).toBe(true);
  });

  it('provider 429 maps to retryable RATE_LIMITED', () => {
    const failure = classifyDiV0PositionTransportError(new DimoRateLimitedError('rate limited', 1000));
    expect(failure.failureClass).toBe('RATE_LIMITED');
    expect(failure.retryable).toBe(true);
  });
});
