import { Phone } from 'lucide-react';
import type { TranslationKey } from '../../i18n/translations/en';
import type { CommunicationApiDirection, CommunicationApiEventType } from '../../../lib/communication/types';
import {
  callEventLabelKey,
  formatDurationSeconds,
} from '../../../lib/communication/timeline-presentation';
import { formatCommunicationTimestamp } from '../../../lib/communication/format';

interface CommunicationCallEventProps {
  eventType: CommunicationApiEventType;
  direction: CommunicationApiDirection | null;
  durationSeconds: number | null;
  occurredAt: string;
  locale: string;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function CommunicationCallEvent({
  eventType,
  direction,
  durationSeconds,
  occurredAt,
  locale,
  t,
}: CommunicationCallEventProps) {
  const label = t(callEventLabelKey(eventType, direction));
  const timeLabel = formatCommunicationTimestamp(occurredAt, locale, t);

  return (
    <div
      data-testid="communication-call-event"
      className="flex justify-center py-1"
    >
      <div
        className="flex max-w-md items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground"
        aria-label={`${label}, ${timeLabel}`}
      >
        <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{label}</p>
          {durationSeconds != null && eventType === 'CALL_ENDED' && (
            <p className="text-[11px]">
              {t('communication.timeline.duration')}: {formatDurationSeconds(durationSeconds, locale)}
            </p>
          )}
          <time dateTime={occurredAt} className="text-[10px] tabular-nums">
            {timeLabel}
          </time>
        </div>
      </div>
    </div>
  );
}
