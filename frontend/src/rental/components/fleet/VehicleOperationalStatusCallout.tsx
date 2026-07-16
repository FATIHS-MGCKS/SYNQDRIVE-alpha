import { useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { VehicleOperationalReadModel } from '../../lib/vehicle-operational-state';
import {
  canViewOperationalStatusDiagnostics,
  resolveOperationalStatusDiagnostics,
  resolveUnreliableOperationalStatusDisplay,
  type OperationalStatusDiagnosticsAccess,
} from '../../lib/vehicle-operational-unknown-display';
import type { OperationalStatusBadgeDisplay } from '../../lib/vehicle-operational-booking-display';

export interface VehicleOperationalStatusCalloutProps {
  vehicle: VehicleOperationalReadModel;
  statusBadge: OperationalStatusBadgeDisplay;
  locale?: string;
  access?: OperationalStatusDiagnosticsAccess;
  onRefresh?: () => void;
  /** Compact mode for list rows and map HUD. */
  compact?: boolean;
  className?: string;
}

export function VehicleOperationalStatusCallout({
  vehicle,
  statusBadge,
  locale = 'de',
  access,
  onRefresh,
  compact = false,
  className,
}: VehicleOperationalStatusCalloutProps) {
  const [expanded, setExpanded] = useState(false);

  if (!statusBadge.showUnreliableCallout) return null;

  const displayLocale = locale === 'en' ? 'en' : 'de';
  const unreliable = resolveUnreliableOperationalStatusDisplay(vehicle, {
    locale: displayLocale,
  });
  if (!unreliable) return null;

  const canViewDiagnostics = access ? canViewOperationalStatusDiagnostics(access) : false;
  const diagnostics = canViewDiagnostics
    ? resolveOperationalStatusDiagnostics(vehicle, { locale: displayLocale })
    : null;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 bg-muted/15 text-muted-foreground dark:bg-muted/10',
        compact ? 'px-2 py-1.5' : 'px-3 py-2.5',
        className,
      )}
      data-testid="vehicle-operational-status-callout"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip
              tone={statusBadge.tone}
              className={cn(
                'font-semibold',
                compact ? 'px-1.5 py-0.5 text-[9.5px]' : 'px-2 py-0.5 text-[10px]',
              )}
            >
              {statusBadge.label}
            </StatusChip>
          </div>
          <p
            className={cn(
              'text-muted-foreground',
              compact ? 'text-[10px] leading-snug' : 'text-[11px] leading-relaxed',
            )}
          >
            {unreliable.explanation}
          </p>
          {!compact ? (
            <p className="text-[10px] text-muted-foreground/80">{unreliable.retryLaterHint}</p>
          ) : null}
        </div>

        {onRefresh ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRefresh();
            }}
            className={cn(
              'sq-press inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background/80 font-medium text-foreground transition-colors hover:bg-muted/40',
              compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1.5 text-[11px]',
            )}
          >
            <RefreshCw className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            {unreliable.refreshLabel}
          </button>
        ) : null}
      </div>

      {diagnostics ? (
        <div className={cn(compact ? 'mt-1.5' : 'mt-2')}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setExpanded((value) => !value);
            }}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={expanded}
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
            />
            {diagnostics.technicalDetailsLabel}
          </button>
          {expanded ? (
            <dl className="mt-1.5 space-y-1.5 rounded-md border border-border/40 bg-background/60 p-2">
              {diagnostics.fields.map((field) => (
                <div key={field.key}>
                  <dt className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-[10px] leading-relaxed text-foreground/90">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Inline one-line hint for compact list surfaces (no refresh/admin chrome).
 */
export function VehicleOperationalStatusInlineHint({
  statusBadge,
  className,
}: {
  statusBadge: OperationalStatusBadgeDisplay;
  className?: string;
}) {
  if (!statusBadge.showUnreliableCallout || !statusBadge.unreliableExplanation) return null;

  return (
    <p
      className={cn('truncate text-[10px] text-muted-foreground', className)}
      title={statusBadge.unreliableExplanation}
      data-testid="vehicle-operational-status-inline-hint"
    >
      {statusBadge.unreliableExplanation}
    </p>
  );
}
