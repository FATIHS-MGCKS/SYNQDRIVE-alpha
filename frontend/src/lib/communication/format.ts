export type CommunicationTimestampKind =
  | 'invalid'
  | 'today'
  | 'yesterday'
  | 'same_year'
  | 'other_year';

export interface CommunicationTimestampParts {
  kind: CommunicationTimestampKind;
  date: Date | null;
}

function isSameLocalDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/** Classify an ISO timestamp against a reference clock in local timezone semantics. */
export function classifyCommunicationTimestamp(
  iso: string,
  now: Date = new Date(),
): CommunicationTimestampParts {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { kind: 'invalid', date: null };
  }

  if (isSameLocalDay(date, now)) {
    return { kind: 'today', date };
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) {
    return { kind: 'yesterday', date };
  }

  if (date.getFullYear() === now.getFullYear()) {
    return { kind: 'same_year', date };
  }

  return { kind: 'other_year', date };
}

type TimestampTranslator = (key: 'communication.time.yesterday') => string;

/** Locale-aware compact timestamp for inbox rows (local timezone semantics). */
export function formatCommunicationTimestamp(
  iso: string,
  locale: string,
  t: TimestampTranslator,
  now: Date = new Date(),
): string {
  const parts = classifyCommunicationTimestamp(iso, now);
  if (!parts.date) return '';

  switch (parts.kind) {
    case 'today':
      return parts.date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    case 'yesterday':
      return t('communication.time.yesterday');
    case 'same_year':
      return parts.date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
    case 'other_year':
      return parts.date.toLocaleDateString(locale, {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      });
    default:
      return '';
  }
}
