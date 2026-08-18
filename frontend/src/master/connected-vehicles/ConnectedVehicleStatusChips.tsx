import { StatusChip } from '../../components/patterns';
import type { VehicleAttentionSummary, IntegrationConnectivity, TelemetryFreshness } from './types';
import {
  attentionReasonLabel,
  attentionSeverityTone,
  integrationConnectivityTone,
  integrityTone,
  telemetryFreshnessTone,
} from './cv.utils';

export function CvAttentionChip({
  attention,
  compact,
}: {
  attention: VehicleAttentionSummary;
  compact?: boolean;
}) {
  if (attention.severity === 'none') {
    return (
      <StatusChip tone="success" dot={!compact} className={compact ? 'text-xs' : undefined}>
        OK
      </StatusChip>
    );
  }
  const label = attention.primaryReason
    ? attentionReasonLabel(attention.primaryReason)
    : 'Aufmerksamkeit';
  return (
    <StatusChip
      tone={attentionSeverityTone(attention.severity)}
      dot
      className={compact ? 'text-xs' : undefined}
    >
      {compact ? label : `${label}${attention.reasonCount > 1 ? ` (+${attention.reasonCount - 1})` : ''}`}
    </StatusChip>
  );
}

export function CvIntegrationChip({
  label,
  state,
}: {
  label: string;
  state: IntegrationConnectivity;
}) {
  return (
    <StatusChip tone={integrationConnectivityTone(state)} dot className="text-xs">
      {label}
    </StatusChip>
  );
}

export function CvTelemetryChip({
  label,
  freshness,
}: {
  label: string;
  freshness: TelemetryFreshness;
}) {
  return (
    <StatusChip tone={telemetryFreshnessTone(freshness)} dot className="text-xs">
      {label}
    </StatusChip>
  );
}

export function CvIntegrityChip({ state }: { state: string }) {
  const labels: Record<string, string> = {
    healthy: 'Intakt',
    attention: 'Prüfen',
    conflict: 'Konflikt',
  };
  return (
    <StatusChip tone={integrityTone(state)} dot className="text-xs">
      {labels[state] ?? state}
    </StatusChip>
  );
}
