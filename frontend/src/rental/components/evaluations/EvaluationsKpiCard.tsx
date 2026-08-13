/**
 * E6B presentational KPI card. Display-only: label + value + canonical status badge
 * + optional note. It never coerces unknown/unavailable to 0 — the caller passes a
 * pre-resolved display string (already status-aware) and the canonical status.
 */
import type { ReactNode } from 'react';
import type { EvaluationsMetricStatus } from '../../lib/evaluations/evaluations-canonical.types';
import { MetricStatusBadge } from './MetricStatusBadge';

export function EvaluationsKpiCard({
  label,
  value,
  status,
  note,
  testId,
}: {
  label: string;
  /** Pre-formatted display string, or a placeholder for no-value states. */
  value: ReactNode;
  status?: EvaluationsMetricStatus;
  note?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 flex flex-col gap-1 min-w-0"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--muted-foreground)] truncate">{label}</span>
        {status ? <MetricStatusBadge status={status} /> : null}
      </div>
      <span className="text-lg font-semibold tabular-nums break-words">{value}</span>
      {note ? <span className="text-[11px] text-[var(--muted-foreground)]">{note}</span> : null}
    </div>
  );
}
