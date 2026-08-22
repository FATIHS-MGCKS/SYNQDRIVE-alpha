import { useMemo } from 'react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationApiChannel, CommunicationEvent } from '../../../lib/communication/types';
import {
  buildTimelineWithDateSeparators,
  contentTypeLabelKey,
  type TimelinePresentationItem,
} from '../../../lib/communication/timeline-presentation';
import { classifyCommunicationTimestamp } from '../../../lib/communication/format';
import { CommunicationMessageBubble } from './CommunicationMessageBubble';
import { CommunicationCallEvent } from './CommunicationCallEvent';
import { CommunicationLifecycleEvent } from './CommunicationLifecycleEvent';
import { CommunicationTimelineSkeleton } from './skeletons/CommunicationTimelineSkeleton';

interface CommunicationTimelineProps {
  channel: CommunicationApiChannel;
  events: CommunicationEvent[];
  loading: boolean;
  error: string | null;
  loadingOlder: boolean;
  hasMore: boolean;
  paginationError: string | null;
  onRetry: () => void;
  onLoadOlder: () => void;
  onRetryLoadOlder: () => void;
}

function formatDateSeparator(
  iso: string,
  locale: string,
  t: (key: 'communication.time.yesterday' | 'communication.timeline.today') => string,
): string {
  const parts = classifyCommunicationTimestamp(iso);
  if (!parts.date) return '';
  if (parts.kind === 'today') return t('communication.timeline.today');
  if (parts.kind === 'yesterday') return t('communication.time.yesterday');
  return parts.date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: parts.kind === 'other_year' ? 'numeric' : undefined,
  });
}

function renderTimelineItem(
  item: TimelinePresentationItem,
  channel: CommunicationApiChannel,
  locale: string,
  t: ReturnType<typeof useLanguage>['t'],
) {
  if (item.kind === 'date-separator') {
    return (
      <div
        key={item.id}
        data-testid="communication-timeline-date-separator"
        className="flex justify-center py-2"
      >
        <span className="rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {formatDateSeparator(item.occurredAt, locale, t)}
        </span>
      </div>
    );
  }

  if (item.kind === 'message') {
    const isText = item.contentType === 'TEXT';
    const showText = isText ? item.text : item.text;
    const contentLabel = t(contentTypeLabelKey(item.contentType));
    return (
      <CommunicationMessageBubble
        key={item.id}
        direction={item.direction}
        channel={channel}
        contentLabel={contentLabel}
        text={isText ? showText : showText}
        showMediaLabel={!isText}
        truncated={item.truncated}
        attachmentCount={item.attachmentCount}
        hasAttachments={item.hasAttachments}
        occurredAt={item.occurredAt}
        locale={locale}
        t={t}
      />
    );
  }

  if (item.kind === 'call') {
    return (
      <CommunicationCallEvent
        key={item.id}
        eventType={item.eventType}
        direction={item.direction}
        durationSeconds={item.durationSeconds}
        occurredAt={item.occurredAt}
        locale={locale}
        t={t}
      />
    );
  }

  return (
    <CommunicationLifecycleEvent
      key={item.id}
      eventType={item.eventType}
      occurredAt={item.occurredAt}
      locale={locale}
      t={t}
    />
  );
}

export function CommunicationTimeline({
  channel,
  events,
  loading,
  error,
  loadingOlder,
  hasMore,
  paginationError,
  onRetry,
  onLoadOlder,
  onRetryLoadOlder,
}: CommunicationTimelineProps) {
  const { t, locale } = useLanguage();

  const timelineItems = useMemo(
    () => buildTimelineWithDateSeparators(events, channel),
    [events, channel],
  );

  if (loading) {
    return <CommunicationTimelineSkeleton />;
  }

  if (error) {
    return (
      <div
        data-testid="communication-timeline-error"
        className="flex flex-col items-center justify-center gap-3 p-6 text-center"
      >
        <p className="text-[13px] text-muted-foreground">{t('communication.timeline.timelineError')}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {t('communication.timeline.retry')}
        </Button>
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div
        data-testid="communication-timeline-empty"
        className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted-foreground"
      >
        {t('communication.timeline.timelineEmpty')}
      </div>
    );
  }

  return (
    <div data-testid="communication-timeline" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border/20 px-3 py-2">
        {hasMore && (
          <div className="flex justify-center">
            {paginationError ? (
              <div
                data-testid="communication-timeline-pagination-error"
                className="flex flex-col items-center gap-2"
              >
                <p className="text-[11px] text-muted-foreground">
                  {t('communication.timeline.timelineError')}
                </p>
                <Button type="button" variant="ghost" size="sm" onClick={onRetryLoadOlder}>
                  {t('communication.timeline.retry')}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="communication-timeline-load-older"
                disabled={loadingOlder}
                onClick={onLoadOlder}
              >
                {loadingOlder
                  ? t('communication.inbox.loadingMore')
                  : t('communication.timeline.loadOlder')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {timelineItems.map((item) => renderTimelineItem(item, channel, locale, t))}
      </div>
    </div>
  );
}
