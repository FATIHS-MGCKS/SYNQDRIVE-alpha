import type { PhysicalStateReconcileResult } from './device-connection-physical-state.types';

type PhysicalStateMetricSink = {
  connectivityPhysicalStateTransitionAppliedTotal?: { inc: (labels: Record<string, string>) => void };
  connectivityPhysicalStateEvidenceStaleTotal?: { inc: (labels: Record<string, string>) => void };
  connectivityPhysicalStateEvidenceConflictTotal?: { inc: (labels: Record<string, string>) => void };
  connectivityPhysicalStateSelfHealTotal?: { inc: (labels: Record<string, string>) => void };
  connectivityPhysicalStateDuplicateTransitionSuppressedTotal?: {
    inc: (labels: Record<string, string>) => void;
  };
};

let metricSink: PhysicalStateMetricSink | null = null;

export function bindPhysicalStateMetricSink(sink: PhysicalStateMetricSink): void {
  metricSink = sink;
}

export function recordPhysicalStateReconcileDecision(result: PhysicalStateReconcileResult): void {
  if (!metricSink || result.decision === 'DISABLED') return;

  const ctx = result.context;
  const source = ctx.incomingEvidenceSource;
  const transition = `${ctx.previousState ?? 'NONE'}_TO_${ctx.resultingState ?? 'NONE'}`;

  switch (result.decision) {
    case 'APPLIED':
      metricSink.connectivityPhysicalStateTransitionAppliedTotal?.inc({ source, transition });
      if (
        ctx.selfHeal &&
        ctx.previousState === 'UNPLUGGED' &&
        ctx.resultingState === 'PLUGGED'
      ) {
        metricSink.connectivityPhysicalStateSelfHealTotal?.inc({
          source,
          outcome: 'projection_self_heal',
        });
      }
      break;
    case 'ESTABLISHED':
      metricSink.connectivityPhysicalStateTransitionAppliedTotal?.inc({
        source,
        transition: `NONE_TO_${ctx.resultingState ?? 'NONE'}`,
      });
      break;
    case 'STALE':
      metricSink.connectivityPhysicalStateEvidenceStaleTotal?.inc({ source });
      break;
    case 'CONFLICT':
      metricSink.connectivityPhysicalStateEvidenceConflictTotal?.inc({ source });
      break;
    case 'DUPLICATE':
      metricSink.connectivityPhysicalStateDuplicateTransitionSuppressedTotal?.inc({ source });
      break;
    case 'PROVENANCE_REFRESH':
      metricSink.connectivityPhysicalStateSelfHealTotal?.inc({
        source,
        outcome: 'provenance_refresh',
      });
      break;
    default:
      break;
  }
}
