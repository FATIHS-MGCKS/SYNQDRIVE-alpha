import { memo, type MouseEvent, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type {
  ActionQueueChildSeverity,
  ActionQueueItem,
  ActionQueueSeverity,
} from './dashboardTypes';
import type { NotificationDomain, NotificationSeverity } from './notificationQueueModel';
import { NOTIFICATION_CARD_TYPO } from './notificationCardTypography';
import { attentionCategoryEyebrow, type AttentionRowCopy } from './attentionItemDisplay';

export type AttentionSeverity =
  | ActionQueueSeverity
  | ActionQueueChildSeverity
  | NotificationSeverity;

function severityLabel(severity: AttentionSeverity, de: boolean): string {
  if (severity === 'success') return de ? 'Behoben' : 'Resolved';
  if (severity === 'critical') return de ? 'Kritisch' : 'Critical';
  if (severity === 'overdue') return de ? 'Überfällig' : 'Overdue';
  if (severity === 'warning') return de ? 'Warnung' : 'Warning';
  if (severity === 'attention') return de ? 'Hinweis' : 'Notice';
  return de ? 'Hinweis' : 'Info';
}

function severityTone(severity: AttentionSeverity) {
  if (severity === 'success') return 'success' as const;
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
  const criticalLike =
    severity === 'critical' || severity === 'overdue' || (pinned && severity !== 'success');
  if (criticalLike) {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),color-mix(in_srgb,var(--status-critical)_2%,transparent))]';
  }
  if (severity === 'success') {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-success)_7%,transparent),color-mix(in_srgb,var(--status-success)_2%,transparent))]';
  }
  if (severity === 'warning') {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_7%,transparent),color-mix(in_srgb,var(--status-watch)_2%,transparent))]';
  }
  if (severity === 'attention') {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-info)_5%,transparent),color-mix(in_srgb,var(--status-info)_1.5%,transparent))]';
  }
  if (severity === 'info') {
    return 'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--muted-foreground)_4%,transparent),color-mix(in_srgb,var(--muted-foreground)_1%,transparent))]';
  }
  return '';
}

function rowIconTone(severity: AttentionSeverity, pinned: boolean): string {
  const criticalLike =
    severity === 'critical' || severity === 'overdue' || (pinned && severity !== 'success');
  if (criticalLike) return 'sq-tone-critical';
  if (severity === 'success') return 'sq-tone-success';
  if (severity === 'warning') return 'sq-tone-watch';
  if (severity === 'attention') return 'sq-tone-info';
  return 'bg-muted/45 text-muted-foreground';
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
      className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground opacity-90 transition-colors hover:bg-muted/40 hover:text-foreground group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
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
  queueDomain?: NotificationDomain;
  domainEyebrow?: string;
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
  queueDomain,
  domainEyebrow,
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
  const eyebrow = domainEyebrow ?? attentionCategoryEyebrow({ category, module, groupType }, de);
  const interactive = Boolean(onRowClick);
  const tint = rowTint(severity, pinned, nested);

  return (
    <article
      className={cn(
        'group transition-colors',
        nested
          ? 'border-b border-border/20 py-1.5 pl-7 pr-2.5 last:border-b-0 sm:pl-8 sm:pr-3'
          : cn(
              'rounded-lg border border-border/30 px-2.5 py-2 hover:bg-muted/20',
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
          className={cn(NOTIFICATION_CARD_TYPO.iconWrap, rowIconTone(severity, pinned))}
          aria-hidden
        >
          <Icon name={categoryIcon(category)} className={NOTIFICATION_CARD_TYPO.icon} />
        </span>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <StatusChip tone={severityTone(severity)} className={NOTIFICATION_CARD_TYPO.severityChip}>
              {severityLabel(severity, de)}
            </StatusChip>
            <span className={NOTIFICATION_CARD_TYPO.eyebrow}>{eyebrow}</span>
            {timeLabel ? <span className={NOTIFICATION_CARD_TYPO.time}>{timeLabel}</span> : null}
          </div>

          <p className={NOTIFICATION_CARD_TYPO.title}>{copy.title}</p>

          {copy.contextLine ? <p className={NOTIFICATION_CARD_TYPO.context}>{copy.contextLine}</p> : null}

          {copy.hintLine ? <p className={NOTIFICATION_CARD_TYPO.hint}>{copy.hintLine}</p> : null}
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
