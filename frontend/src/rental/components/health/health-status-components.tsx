import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { HealthStatusChip, StatusChip } from '../../../components/patterns';
import type { RentalHealthModule, RentalHealthState, VehicleHealthResponse } from '../../../lib/api';
import type { RentalHealthReason } from '../../rental-health-ui';
import type { ModuleChipModel } from '../../lib/fleet-health-control-center';
import {
  dataFreshnessForModule,
  evidenceTypeLabel,
  evidenceTypeToTone,
  rentalGateToTone,
  rentalHealthStateToHealthState,
  rentalHealthStateToTone,
  toneToChipClass,
} from '../../lib/rental-health-status';

export function HealthModuleChip({
  chip,
  onClick,
}: {
  chip: ModuleChipModel;
  onClick?: () => void;
}) {
  const tone = rentalHealthStateToTone(chip.state);
  const className = `inline-flex max-w-full items-center gap-1 rounded-md border border-border/50 px-1.5 py-0.5 text-[10px] font-medium transition-colors ${toneToChipClass(tone)}`;

  const content = (
    <>
      <span className="font-semibold">{chip.label}</span>
      <span className="opacity-60">·</span>
      <span className="truncate">{chip.detail}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} sq-press hover:opacity-90`}>
        {content}
      </button>
    );
  }
  return <span className={className}>{content}</span>;
}

export function HealthEvidenceBadge({
  module,
  label,
}: {
  module?: RentalHealthModule;
  label?: string;
}) {
  const text = label ?? (module ? evidenceTypeLabel(module.evidence_type, module.source) : '—');
  const tone = module ? evidenceTypeToTone(module.evidence_type) : 'neutral';
  return <StatusChip tone={tone}>Evidence: {text}</StatusChip>;
}

export function RentalGateChip({
  health,
  className,
}: {
  health: VehicleHealthResponse | null | undefined;
  className?: string;
}) {
  const gate = rentalGateToTone(health);
  return (
    <StatusChip tone={gate.tone} className={className}>
      {gate.label}
    </StatusChip>
  );
}

export function DataFreshnessBadge({
  module,
  relativeLabel,
}: {
  module: RentalHealthModule;
  relativeLabel?: string;
}) {
  const fresh = dataFreshnessForModule(module);
  const label = relativeLabel ?? fresh.label;
  return <StatusChip tone={fresh.tone}>{label}</StatusChip>;
}

export function HealthReasonList({
  blockingReasons = [],
  moduleReasons = [],
  compact,
}: {
  blockingReasons?: string[];
  moduleReasons?: RentalHealthReason[];
  compact?: boolean;
}) {
  if (blockingReasons.length === 0 && moduleReasons.length === 0) return null;

  return (
    <ul className={`space-y-1.5 ${compact ? '' : 'mt-1'}`}>
      {blockingReasons.map((reason) => (
        <li
          key={`block-${reason}`}
          className="flex items-start gap-2 rounded-lg sq-tone-critical px-2.5 py-2 text-[11px] font-medium"
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>{reason}</span>
        </li>
      ))}
      {moduleReasons.map((r) => (
        <li
          key={r.module}
          className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11px] ${
            r.state === 'critical' ? 'sq-tone-critical' : 'sq-tone-warning'
          }`}
        >
          <span className="font-semibold shrink-0">{r.label}:</span>
          <span className="text-foreground/90">{r.reason}</span>
        </li>
      ))}
    </ul>
  );
}

export function OverallHealthChip({
  state,
  label,
  loading,
}: {
  state?: RentalHealthState;
  label?: string;
  loading?: boolean;
}) {
  return (
    <HealthStatusChip
      state={rentalHealthStateToHealthState(state)}
      label={loading ? 'Loading…' : label}
      dot
    />
  );
}

export function HealthTrustMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  tone?: 'success' | 'warning' | 'watch' | 'critical' | 'noData' | 'neutral' | 'info';
}) {
  return (
    <div className="sq-card rounded-lg px-3 py-2 transition-colors">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === 'neutral' ? 'text-foreground' : ''}`}>
        {tone !== 'neutral' ? (
          <StatusChip tone={tone} className="text-sm font-bold tabular-nums">
            {value}
          </StatusChip>
        ) : (
          value
        )}
      </div>
    </div>
  );
}
