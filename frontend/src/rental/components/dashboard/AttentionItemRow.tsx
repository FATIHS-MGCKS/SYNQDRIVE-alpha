import { memo, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type {
  ActionQueueChildSeverity,
  ActionQueueItem,
  ActionQueueSeverity,
} from './dashboardTypes';
import { attentionCategoryEyebrow, type AttentionRowCopy } from './attentionItemDisplay';

export type AttentionSeverity = ActionQueueSeverity | ActionQueueChildSeverity;

function severityLabel(severity: AttentionSeverity, de: boolean): string {
  if (severity === 'critical') return de ? 'Kritisch' : 'Critical';
  if (severity === 'overdue') return de ? 'Überfällig' : 'Overdue';
  if (severity === 'warning') return de ? 'Warnung' : 'Warning';
  if (severity === 'attention') return de ? 'Hinweis' : 'Notice';
  return 'Info';
}

function severityTone(severity: AttentionSeverity) {
  if (severity === 'critical') return 'critical' as const;
  if (severity === 'overdue' || severity === 'warning') return 'watch' as const;
  if (severity === 'attention') return 'info' as const;
  return 'neutral' as const;
}

function categoryIcon(category: ActionQueueItem['category']) {
  if (category === 'handover' || category === 'booking') return 'key';
  if (category === 'health') return 'heart';
  if (category === 'financial') return 'wallet';
  if (category === 'notification') return 'bell';
  if (category === 'operations') return 'calendar-clock';
  if (category === 'task') return 'clipboard-list';
  return 'car';
}

export interface AttentionItemRowProps {
  severity: AttentionSeverity;
  category: ActionQueueItem['category'];
  module?: ActionQueueItem['module'];
  groupType?: ActionQueueItem['groupType'];
  copy: AttentionRowCopy;
  timeLabel?: string;
  ctaLabel?: string;
  de: boolean;
  pinned?: boolean;
  nested?: boolean;
  trailing?: ReactNode;
  onRowClick?: () => void;
  onCtaClick?: () => void;
}

export const AttentionItemRow = memo(function AttentionItemRow({
  severity,
  category,
  module,
  groupType,
  copy,
  timeLabel,
  ctaLabel,
  de,
  pinned = false,
  nested = false,
  trailing,
  onRowClick,
  onCtaClick,
}: AttentionItemRowProps) {
  const eyebrow = attentionCategoryEyebrow({ category, module, groupType }, de);
  const criticalTint = severity === 'critical' || severity === 'overdue' || pinned;
  const interactive = Boolean(onRowClick);

  return (
    <article
      className={cn(
        'transition-colors',
        nested
          ? 'border-b border-border/25 py-2 pl-9 pr-2.5 last:border-b-0 sm:pr-3'
          : 'rounded-lg border border-border/45 bg-card/45 px-2.5 py-2 shadow-sm shadow-black/[0.02] hover:border-border/65 hover:bg-muted/10',
        criticalTint && !nested && 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[color:color-mix(in_srgb,var(--status-critical)_4%,transparent)]',
        interactive && !nested && 'cursor-pointer',
      )}
      onClick={onRowClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRowClick?.();
              }
            }
          : undefined
      }
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            criticalTint ? 'sq-tone-critical' : 'sq-tone-neutral bg-muted/45',
          )}
          aria-hidden
        >
          <Icon name={categoryIcon(category)} className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusChip tone={severityTone(severity)} className="px-1.5 py-0.5 text-[11px] font-semibold">
              {severityLabel(severity, de)}
            </StatusChip>
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </span>
            {timeLabel ? (
              <span className="text-[11px] tabular-nums text-muted-foreground">{timeLabel}</span>
            ) : null}
          </div>

          <p className="text-[13px] font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty">
            {copy.title}
          </p>

          {copy.contextLine ? (
            <p className="truncate text-[12px] leading-snug text-muted-foreground">{copy.contextLine}</p>
          ) : null}

          {copy.hintLine ? (
            <p className="line-clamp-2 text-[12px] leading-snug text-muted-foreground/95 text-pretty">
              {copy.hintLine}
            </p>
          ) : null}
        </div>

        {trailing ?? (
          onCtaClick ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onCtaClick();
              }}
              className="sq-btn sq-btn-secondary min-h-9 shrink-0 self-start px-2 text-[11px]"
            >
              {ctaLabel}
              <Icon name="arrow-right" className="h-3.5 w-3.5 opacity-70" />
            </button>
          ) : null
        )}
      </div>
    </article>
  );
});
