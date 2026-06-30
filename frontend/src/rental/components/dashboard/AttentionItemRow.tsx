import { memo, type MouseEvent, type ReactNode } from 'react';
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

function rowTint(severity: AttentionSeverity, pinned: boolean, nested: boolean): string {
  if (nested) return '';
  const criticalLike = severity === 'critical' || severity === 'overdue' || pinned;
  if (criticalLike) {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_5%,transparent)]';
  }
  if (severity === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_4%,transparent)]';
  }
  return '';
}

export interface AttentionRowActionProps {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  icon?: 'arrow-right' | 'chevron-down';
  expanded?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
}

/** Compact text action — matches FleetOperatorRow "Open" control. */
export function AttentionRowAction({
  label,
  onClick,
  icon = 'arrow-right',
  expanded,
  ariaExpanded,
  ariaControls,
}: AttentionRowActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[10.5px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
    >
      {label}
      <Icon
        name={icon}
        className={cn(
          'h-3 w-3',
          icon === 'chevron-down' && 'transition-transform duration-200',
          icon === 'chevron-down' && !expanded && '-rotate-90',
        )}
      />
    </button>
  );
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
  const criticalLike = severity === 'critical' || severity === 'overdue' || pinned;
  const interactive = Boolean(onRowClick);
  const tint = rowTint(severity, pinned, nested);

  return (
    <article
      className={cn(
        'group transition-colors',
        nested
          ? 'border-b border-border/20 py-1.5 pl-7 pr-2.5 last:border-b-0 sm:pl-8 sm:pr-3'
          : cn(
              'px-2.5 py-2 hover:bg-muted/25',
              tint,
              interactive && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--brand)]',
            ),
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
            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
            criticalLike ? 'sq-tone-critical' : 'bg-muted/45 text-muted-foreground',
          )}
          aria-hidden
        >
          <Icon name={categoryIcon(category)} className="h-3 w-3" />
        </span>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <StatusChip
              tone={severityTone(severity)}
              className="px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide"
            >
              {severityLabel(severity, de)}
            </StatusChip>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </span>
            {timeLabel ? (
              <span className="text-[10.5px] tabular-nums text-muted-foreground">{timeLabel}</span>
            ) : null}
          </div>

          <p className="text-[14px] font-semibold leading-snug tracking-[-0.01em] text-foreground text-pretty">
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

        <div className="flex shrink-0 flex-col items-end self-start pt-0.5">
          {trailing ?? (
            onCtaClick ? (
              <AttentionRowAction
                label={ctaLabel ?? ''}
                onClick={(event) => {
                  event.stopPropagation();
                  onCtaClick();
                }}
              />
            ) : null
          )}
        </div>
      </div>
    </article>
  );
});
