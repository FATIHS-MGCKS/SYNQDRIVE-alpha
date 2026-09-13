import { bindPhysicalStateMetricSink, recordPhysicalStateReconcileDecision } from './device-connection-physical-state.observability';
import type { PhysicalStateReconcileResult } from './device-connection-physical-state.types';

function baseResult(
  overrides: Partial<PhysicalStateReconcileResult> = {},
): PhysicalStateReconcileResult {
  return {
    enabled: true,
    decision: 'APPLIED',
    projection: {
      effectiveState: 'PLUGGED',
      evidenceObservedAt: new Date('2026-09-12T15:02:29.000Z'),
      evidenceSource: 'SNAPSHOT_OBD',
      evidenceReferenceId: 'snap',
      stateVersion: 2,
    },
    transitionId: 't1',
    episodeAction: 'none',
    alertAction: 'none',
    context: {
      previousState: 'UNPLUGGED',
      candidateState: 'PLUGGED',
      resultingState: 'PLUGGED',
      previousEvidenceAt: new Date('2026-08-01T10:00:00.000Z'),
      candidateEvidenceAt: new Date('2026-09-12T15:02:29.000Z'),
      incomingEvidenceSource: 'SNAPSHOT_OBD',
      stateVersionBefore: 1,
      stateVersionAfter: 2,
      selfHeal: true,
      evidenceReferenceId: 'snap',
    },
    ...overrides,
  };
}

describe('device-connection-physical-state.observability', () => {
  it('records self-heal metric for UNPLUGGED -> PLUGGED with selfHeal=true', () => {
    const selfHeal = { inc: jest.fn() };
    const applied = { inc: jest.fn() };
    bindPhysicalStateMetricSink({
      connectivityPhysicalStateSelfHealTotal: selfHeal,
      connectivityPhysicalStateTransitionAppliedTotal: applied,
    });

    recordPhysicalStateReconcileDecision(baseResult());

    expect(applied.inc).toHaveBeenCalledWith({
      source: 'SNAPSHOT_OBD',
      transition: 'UNPLUGGED_TO_PLUGGED',
    });
    expect(selfHeal.inc).toHaveBeenCalledWith({
      source: 'SNAPSHOT_OBD',
      outcome: 'projection_self_heal',
    });
  });

  it('uses incoming evidence source for stale decisions', () => {
    const stale = { inc: jest.fn() };
    bindPhysicalStateMetricSink({
      connectivityPhysicalStateEvidenceStaleTotal: stale,
    });

    recordPhysicalStateReconcileDecision(
      baseResult({
        decision: 'STALE',
        context: {
          ...baseResult().context,
          incomingEvidenceSource: 'WEBHOOK',
          resultingState: 'PLUGGED',
        },
      }),
    );

    expect(stale.inc).toHaveBeenCalledWith({ source: 'WEBHOOK' });
  });
});
