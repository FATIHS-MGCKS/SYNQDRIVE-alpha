import { memo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { ActionQueueItem } from '../dashboardTypes';
import { NotificationDetailPanel } from './NotificationDetailPanel';
import { NotificationSummaryRow } from './NotificationSummaryRow';
import { buildNotificationDetailViewModel } from './notification-task-bridge';
import { buildNotificationSummaryFromItem } from './notification-summary-view-model';
import type { useLanguage } from '../../../i18n/LanguageContext';

function entrySurface(resolved: boolean, severity: string): string {
  if (resolved) {
    return 'border-border/30 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-success)_6%,transparent),transparent)]';
  }
  if (severity === 'critical') {
    return 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),transparent)]';
  }
  if (severity === 'warning') {
    return 'border-[color:color-mix(in_srgb,var(--status-watch)_20%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_6%,transparent),transparent)]';
  }
  return 'border-border/30 bg-card/40';
}

export interface NotificationEntryCardProps {
  item: ActionQueueItem;
  locale: string;
  referenceNowMs: number;
  t: ReturnType<typeof useLanguage>['t'];
  onPrimaryCta: () => void;
  onSecondaryCta?: () => void;
  onCreateTask?: () => void;
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
}

export const NotificationEntryCard = memo(function NotificationEntryCard({
  item,
  locale,
  referenceNowMs,
  t,
  onPrimaryCta,
  onSecondaryCta,
  onCreateTask,
  onMarkRead,
  onAcknowledge,
  onSnooze,
}: NotificationEntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const summary = buildNotificationSummaryFromItem(item, locale, referenceNowMs);
  if (!summary) return null;

  const detail = buildNotificationDetailViewModel(item, locale, referenceNowMs);
  const contentId = `notification-entry-${item.id}`;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none',
        entrySurface(summary.resolved, summary.severity),
        summary.unread && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]',
        expanded && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]',
      )}
    >
      <div className="px-3 py-2.5">
        <NotificationSummaryRow
          summary={summary}
          t={t}
          locale={locale}
          expanded={expanded}
          showChevron
          unread={summary.unread}
          as="button"
          onToggle={() => setExpanded((value) => !value)}
        />
      </div>

      {expanded ? (
        <div id={contentId}>
          <NotificationDetailPanel
            detail={detail}
            t={t}
            readStatus={item.queue?.readStatus}
            onPrimaryCta={onPrimaryCta}
            onSecondaryCta={onSecondaryCta}
            onCreateTask={onCreateTask}
            onMarkRead={onMarkRead}
            onAcknowledge={onAcknowledge}
            onSnooze={onSnooze}
          />
        </div>
      ) : null}
    </article>
  );
});
