import type { TranslationKey } from '../../i18n/translations/en';
import type { CommunicationApiEventType } from '../../../lib/communication/types';
import { lifecycleEventLabelKey } from '../../../lib/communication/timeline-presentation';
import { formatCommunicationTimestamp } from '../../../lib/communication/format';

interface CommunicationLifecycleEventProps {
  eventType: CommunicationApiEventType;
  occurredAt: string;
  locale: string;
  t: (key: TranslationKey) => string;
}

export function CommunicationLifecycleEvent({
  eventType,
  occurredAt,
  locale,
  t,
}: CommunicationLifecycleEventProps) {
  const label = t(lifecycleEventLabelKey(eventType));
  const timeLabel = formatCommunicationTimestamp(occurredAt, locale, t);

  return (
    <div
      data-testid="communication-lifecycle-event"
      className="flex justify-center py-1"
    >
      <p
        className="rounded-full border border-border/30 bg-muted/20 px-3 py-1 text-[11px] text-muted-foreground"
        aria-label={`${label}, ${timeLabel}`}
      >
        {label}
        <span className="mx-1.5" aria-hidden>
          ·
        </span>
        <time dateTime={occurredAt} className="tabular-nums">
          {timeLabel}
        </time>
      </p>
    </div>
  );
}
