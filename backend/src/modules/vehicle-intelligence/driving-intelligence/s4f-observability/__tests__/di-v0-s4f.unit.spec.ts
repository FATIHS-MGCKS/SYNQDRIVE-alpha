import { DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1 } from '../di-v0-s4f-observability-contract';
import { evaluateDiV0S4fTinyActivationReadiness } from '../di-v0-s4f-activation-readiness';
import { assertBoundedPrometheusLabels } from '../di-v0-s4f-metric-labels';
import { auditDiV0S4ProviderBackpressure } from '../di-v0-s4f-provider-backpressure-audit';
import { evaluateDiV0S4fExecutorLiveness } from '../di-v0-s4f-executor-liveness';
import { DiV0S4ExecutorRegistry } from '../../s4b-orchestration/di-v0-s4b-executor.port';

describe('DI V0 S4F unit', () => {
  it('F16 missing prerequisites → NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({});
    expect(r.finalState).toBe('NOT_READY');
    expect(r.tinyActivationReady).toBe(false);
    expect(r.explicitOperatorAuthorizationGate).toBe('NOT_SATISFIED');
  });

  it('F17 provider backpressure OPEN → NOT_READY', () => {
    const audit = auditDiV0S4ProviderBackpressure();
    expect(audit.gapStatus).toBe('OPEN_CONFIRMED');
    const r = evaluateDiV0S4fTinyActivationReadiness({
      locationRetentionGovernanceNotePresent: true,
      explicitOperatorAuthorization: true,
      providerBackpressureGapClosed: false,
    });
    expect(r.providerBackpressureGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F18 location governance missing → NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      providerBackpressureGapClosed: true,
      explicitOperatorAuthorization: true,
      locationRetentionGovernanceNotePresent: false,
    });
    expect(r.locationRetentionGovernanceGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F19 explicit operator authorization absent → NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      providerBackpressureGapClosed: true,
      locationRetentionGovernanceNotePresent: true,
    });
    expect(r.explicitOperatorAuthorizationGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F20 native readiness does not satisfy tiny activation path', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      providerBackpressureGapClosed: true,
      locationRetentionGovernanceNotePresent: true,
      explicitOperatorAuthorization: true,
    });
    expect(r.nativeReadinessGate).toBe('NOT_SATISFIED');
    expect(r.replayDeserializerGate).toBe('SATISFIED');
    expect(r.finalState).toBe('READY');
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

  it('observability contract version is stable', () => {
    expect(DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1).toBe('DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1');
  });
});
