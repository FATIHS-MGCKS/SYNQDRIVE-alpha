import type { PhysicalTransitionDecision } from './device-connection-physical-state.types';

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

export function recordPhysicalStateReconcileDecision(
  decision: PhysicalTransitionDecision,
  input: {
    source: string;
    previousState: string | null;
    nextState: string | null;
  },
): void {
  if (!metricSink) return;

  switch (decision) {
    case 'APPLIED':
    case 'ESTABLISHED':
      metricSink.connectivityPhysicalStateTransitionAppliedTotal?.inc({
        source: input.source,
        transition: `${input.previousState ?? 'NONE'}_TO_${input.nextState ?? 'NONE'}`,
      });
      break;
    case 'STALE':
      metricSink.connectivityPhysicalStateEvidenceStaleTotal?.inc({ source: input.source });
      break;
    case 'CONFLICT':
      metricSink.connectivityPhysicalStateEvidenceConflictTotal?.inc({ source: input.source });
      break;
    case 'DUPLICATE':
      metricSink.connectivityPhysicalStateDuplicateTransitionSuppressedTotal?.inc({
        source: input.source,
      });
      break;
    case 'PROVENANCE_REFRESH':
      if (input.previousState === input.nextState) {
        metricSink.connectivityPhysicalStateSelfHealTotal?.inc({
          source: input.source,
          outcome: 'provenance_refresh',
        });
      }
      break;
    default:
      break;
  }
}
