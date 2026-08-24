import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
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
import { CommunicationMediaContent } from './CommunicationMediaContent';
import { CommunicationCallEvent } from './CommunicationCallEvent';
import { CommunicationLifecycleEvent } from './CommunicationLifecycleEvent';
import { CommunicationTimelineSkeleton } from './skeletons/CommunicationTimelineSkeleton';

interface CommunicationTimelineProps {
  orgId: string;
  channel: CommunicationApiChannel;
  events: CommunicationEvent[];
  conversationSignature: string;
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
  orgId: string,
  channel: CommunicationApiChannel,
  locale: string,
  t: ReturnType<typeof useLanguage>['t'],
) {
  if (item.kind === 'date-separator') {
    const label = formatDateSeparator(item.occurredAt, locale, t);
    if (!label) return null;
    return (
      <div
        data-testid="communication-timeline-date-separator"
        className="flex justify-center py-2"
      >
        <span className="rounded-full bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
    );
  }

  if (item.kind === 'message') {
    const isText = item.contentType === 'TEXT';
    const isRenderableMedia =
      item.contentType === 'IMAGE' || item.contentType === 'DOCUMENT';
    const contentLabel = t(contentTypeLabelKey(item.contentType, item.contentAvailability));

    if (isRenderableMedia) {
      return (
        <div
          data-testid="communication-message-bubble"
          data-direction={item.direction}
          className={item.direction === 'inbound' ? 'flex w-full justify-start' : 'flex w-full justify-end'}
        >
          <article
            className="max-w-[min(85%,28rem)] rounded-xl border border-border/50 bg-muted/40 px-3 py-2 text-[13px]"
          >
            <CommunicationMediaContent
              orgId={orgId}
              contentType={item.contentType as 'IMAGE' | 'DOCUMENT'}
              caption={item.text}
              attachments={item.attachments}
              t={t}
            />
          </article>
        </div>
      );
    }

    return (
      <CommunicationMessageBubble
        direction={item.direction}
        channel={channel}
        contentLabel={contentLabel}
        text={isText ? item.text : item.text}
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
      eventType={item.eventType}
      occurredAt={item.occurredAt}
      locale={locale}
      t={t}
    />
  );
}

export function CommunicationTimeline({
  orgId,
  channel,
  events,
  conversationSignature,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const prependBaselineRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
    eventCount: number;
  } | null>(null);
  const previousSignatureRef = useRef<string | null>(null);
  const previousEventCountRef = useRef(0);

  const timelineItems = useMemo(
    () => buildTimelineWithDateSeparators(events, channel),
    [events, channel],
  );

  const handleLoadOlder = useCallback(() => {
    const el = scrollRef.current;
    if (el) {
      prependBaselineRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        eventCount: events.length,
      };
    }
    onLoadOlder();
  }, [onLoadOlder, events.length]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || loading) return;

    if (conversationSignature !== previousSignatureRef.current) {
      el.scrollTop = el.scrollHeight;
      previousSignatureRef.current = conversationSignature;
      previousEventCountRef.current = events.length;
      prependBaselineRef.current = null;
      return;
    }

    const baseline = prependBaselineRef.current;
    if (baseline && events.length > baseline.eventCount) {
      const delta = el.scrollHeight - baseline.scrollHeight;
      if (delta > 0) {
        el.scrollTop = baseline.scrollTop + delta;
      }
      prependBaselineRef.current = null;
      previousEventCountRef.current = events.length;
      return;
    }

    if (events.length > previousEventCountRef.current && previousEventCountRef.current === 0) {
      el.scrollTop = el.scrollHeight;
    }

    previousEventCountRef.current = events.length;
  }, [conversationSignature, events.length, loading]);

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
                onClick={handleLoadOlder}
              >
                {loadingOlder
                  ? t('communication.inbox.loadingMore')
                  : t('communication.timeline.loadOlder')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        data-testid="communication-timeline-scroll"
      >
        <ol className="space-y-2" aria-label={t('communication.timeline.listLabel')}>
          {timelineItems.map((item) => (
            <li key={item.id} className="list-none">
              {renderTimelineItem(item, orgId, channel, locale, t)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
