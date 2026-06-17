import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { HealthStatusChip, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import type { RentalHealthModule, RentalHealthState } from '../../../lib/api';
import { normalizeHealthState } from '../../../components/patterns';
import { evidenceLabel, freshnessLabel } from '../../lib/health-detail-utils';

export interface KeyValueRow {
  label: string;
  value: ReactNode;
}

export interface HealthModuleCardProps {
  title: string;
  icon: LucideIcon;
  rentalModule?: RentalHealthModule;
  state?: RentalHealthState;
  reason?: string;
  keyValues?: KeyValueRow[];
  children?: ReactNode;
  percent?: number | null;
  percentLabel?: string;
  showPercent?: boolean;
}

function stateToHealthChip(state: RentalHealthState | undefined) {
  if (!state) return 'unknown' as const;
  if (state === 'n_a') return 'no_data' as const;
  return normalizeHealthState(state);
}

export function HealthModuleCard({
  title,
  icon: IconCmp,
  rentalModule,
  state,
  reason,
  keyValues = [],
  children,
  percent,
  percentLabel,
  showPercent = false,
}: HealthModuleCardProps) {
  const modState = state ?? rentalModule?.state;
  const modReason = reason ?? rentalModule?.reason ?? '—';
  const fresh = rentalModule ? freshnessLabel(rentalModule) : { label: '—', tone: 'noData' as StatusTone };
  const evidence = rentalModule ? evidenceLabel(rentalModule) : '—';

  const pct =
    showPercent && percent != null && Number.isFinite(percent)
      ? Math.min(Math.max(percent, 0), 100)
      : null;

  return (
    <div className="sq-card rounded-xl p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sq-tone-neutral">
            <IconCmp className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h4 className="text-[13px] font-semibold text-foreground">{title}</h4>
            <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{modReason}</p>
          </div>
        </div>
        <HealthStatusChip state={stateToHealthChip(modState)} dot />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <StatusChip tone={fresh.tone}>{fresh.label}</StatusChip>
        <StatusChip tone="neutral">Evidence: {evidence}</StatusChip>
      </div>

      {keyValues.length > 0 && (
        <dl className="grid grid-cols-1 gap-1.5 text-[12px]">
          {keyValues.map((row) => (
            <div key={row.label} className="grid grid-cols-[minmax(0,42%)_1fr] gap-2">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium text-foreground break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {pct != null && (
        <div>
          {percentLabel && (
            <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{percentLabel}</span>
              <span className="tabular-nums font-semibold text-foreground">{Math.round(pct)}%</span>
            </div>
          )}
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[color:var(--status-info)]"
              style={{ width: `${Math.max(6, pct)}%` }}
            />
          </div>
        </div>
      )}

      {children}
    </div>
  );
}

export function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="sq-section-label">{title}</h3>
      {children}
    </section>
  );
}
