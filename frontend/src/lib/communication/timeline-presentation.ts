import type { TranslationKey } from '../../rental/i18n/translations/en';
import type {
  CommunicationApiChannel,
  CommunicationApiDirection,
  CommunicationApiEventType,
  CommunicationApiMessageContentType,
  CommunicationEvent,
  CommunicationMessageContent,
} from './types';

export type TimelinePresentationKind = 'message' | 'lifecycle' | 'call' | 'date-separator';

export type MessageDirection = 'inbound' | 'outbound';

export interface TimelineDateSeparatorItem {
  kind: 'date-separator';
  id: string;
  dateKey: string;
  occurredAt: string;
}

export interface TimelineMessageItem {
  kind: 'message';
  id: string;
  eventId: string;
  direction: MessageDirection;
  channel: CommunicationApiChannel;
  contentType: CommunicationApiMessageContentType | 'UNAVAILABLE';
  text: string | null;
  truncated: boolean;
  hasAttachments: boolean;
  attachmentCount: number;
  occurredAt: string;
  deliveryFailed: boolean;
}

export interface TimelineLifecycleItem {
  kind: 'lifecycle';
  id: string;
  eventType: CommunicationApiEventType;
  occurredAt: string;
}

export interface TimelineCallItem {
  kind: 'call';
  id: string;
  eventType: CommunicationApiEventType;
  direction: CommunicationApiDirection | null;
  durationSeconds: number | null;
  occurredAt: string;
}

export type TimelinePresentationItem =
  | TimelineDateSeparatorItem
  | TimelineMessageItem
  | TimelineLifecycleItem
  | TimelineCallItem;

const MESSAGE_EVENT_TYPES = new Set<CommunicationApiEventType>([
  'MESSAGE_RECEIVED',
  'MESSAGE_SENT',
]);

const CALL_EVENT_TYPES = new Set<CommunicationApiEventType>([
  'CALL_STARTED',
  'CALL_CONNECTED',
  'CALL_ENDED',
  'CALL_FAILED',
]);

const LIFECYCLE_EVENT_TYPES = new Set<CommunicationApiEventType>([
  'MESSAGE_DELIVERED',
  'MESSAGE_READ',
  'MESSAGE_FAILED',
  'AI_INTENT_DETECTED',
  'AI_ACTION_STARTED',
  'AI_ACTION_COMPLETED',
  'AI_ACTION_FAILED',
  'HUMAN_REQUIRED',
  'HUMAN_ASSIGNED',
  'HUMAN_TAKEOVER',
  'CONVERSATION_RESOLVED',
  'CONVERSATION_REOPENED',
  'PROVIDER_ERROR',
]);

/** Mirrors backend CANONICAL_COMMUNICATION_METADATA_KEYS allowlist for read DTO projection. */
export const CANONICAL_COMMUNICATION_METADATA_KEYS = [
  'durationSeconds',
  'outcomeCode',
  'intentCode',
  'toolName',
  'actionName',
  'failureCode',
  'handoffReasonCode',
  'templateName',
  'languageCode',
  'providerLifecycleState',
] as const;

/** Read only allowlisted canonical metadata — durationSeconds is C7-projected safe field. */
export function readCanonicalCallDurationSeconds(
  metadata: CommunicationEvent['metadata'],
): number | null {
  if (!metadata || typeof metadata.durationSeconds !== 'number') return null;
  if (!Number.isFinite(metadata.durationSeconds)) return null;
  return metadata.durationSeconds;
}

function resolveMessageDirection(event: CommunicationEvent): MessageDirection {
  if (event.eventType === 'MESSAGE_RECEIVED') return 'inbound';
  if (event.eventType === 'MESSAGE_SENT') return 'outbound';
  if (event.direction === 'INBOUND') return 'inbound';
  if (event.direction === 'OUTBOUND') return 'outbound';
  return 'inbound';
}

function mapContentType(
  content: CommunicationMessageContent | null | undefined,
): CommunicationApiMessageContentType | 'UNAVAILABLE' {
  if (!content) return 'UNAVAILABLE';
  return content.contentType;
}

/** Map a canonical event to a presentation item. Returns null for unknown types. */
export function mapEventToPresentation(
  event: CommunicationEvent,
  channel: CommunicationApiChannel,
): TimelinePresentationItem | null {
  if (MESSAGE_EVENT_TYPES.has(event.eventType)) {
    const content = event.content;
    return {
      kind: 'message',
      id: event.id,
      eventId: event.id,
      direction: resolveMessageDirection(event),
      channel,
      contentType: mapContentType(content),
      text: content?.text ?? null,
      truncated: content?.truncated ?? false,
      hasAttachments: content?.hasAttachments ?? false,
      attachmentCount: content?.attachmentCount ?? 0,
      occurredAt: event.occurredAt,
      deliveryFailed: false,
    };
  }

  if (CALL_EVENT_TYPES.has(event.eventType)) {
    const durationSeconds = readCanonicalCallDurationSeconds(event.metadata);
    return {
      kind: 'call',
      id: event.id,
      eventType: event.eventType,
      direction: event.direction ?? null,
      durationSeconds,
      occurredAt: event.occurredAt,
    };
  }

  if (LIFECYCLE_EVENT_TYPES.has(event.eventType)) {
    return {
      kind: 'lifecycle',
      id: event.id,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
    };
  }

  return {
    kind: 'lifecycle',
    id: event.id,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
  };
}

/** Backend returns newest-first; transform to chronological oldest→newest for display. */
export function compareCommunicationEventsChronologically(
  a: CommunicationEvent,
  b: CommunicationEvent,
): number {
  const aTime = Date.parse(a.occurredAt);
  const bTime = Date.parse(b.occurredAt);
  const aValid = !Number.isNaN(aTime);
  const bValid = !Number.isNaN(bTime);

  if (aValid && bValid && aTime !== bTime) return aTime - bTime;
  if (aValid !== bValid) return aValid ? -1 : 1;
  return a.id.localeCompare(b.id);
}

export function sortEventsChronologically(events: CommunicationEvent[]): CommunicationEvent[] {
  return [...events].sort(compareCommunicationEventsChronologically);
}

function localDateKey(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Insert date separators between events on different local days. */
export function buildTimelineWithDateSeparators(
  events: CommunicationEvent[],
  channel: CommunicationApiChannel,
): TimelinePresentationItem[] {
  const chronological = sortEventsChronologically(events);
  const result: TimelinePresentationItem[] = [];
  let lastDateKey: string | null = null;

  for (const event of chronological) {
    const dateKey = localDateKey(event.occurredAt);
    if (dateKey && dateKey !== lastDateKey) {
      result.push({
        kind: 'date-separator',
        id: `sep-${dateKey}-${event.id}`,
        dateKey,
        occurredAt: event.occurredAt,
      });
      lastDateKey = dateKey;
    }
    const item = mapEventToPresentation(event, channel);
    if (item) result.push(item);
  }

  return result;
}

export function contentTypeLabelKey(
  contentType: CommunicationApiMessageContentType | 'UNAVAILABLE',
): TranslationKey {
  switch (contentType) {
    case 'TEXT':
      return 'communication.timeline.text';
    case 'IMAGE':
      return 'communication.timeline.image';
    case 'VIDEO':
      return 'communication.timeline.video';
    case 'AUDIO':
      return 'communication.timeline.audio';
    case 'DOCUMENT':
      return 'communication.timeline.document';
    case 'LOCATION':
      return 'communication.preview.location';
    case 'CONTACT':
      return 'communication.preview.contact';
    case 'MIXED':
      return 'communication.preview.mixed';
    case 'UNSUPPORTED':
      return 'communication.timeline.unsupportedMessage';
    case 'UNAVAILABLE':
      return 'communication.timeline.messageUnavailable';
    default:
      return 'communication.timeline.unsupportedMessage';
  }
}

export function lifecycleEventLabelKey(eventType: CommunicationApiEventType): TranslationKey {
  switch (eventType) {
    case 'MESSAGE_DELIVERED':
      return 'communication.timeline.delivered';
    case 'MESSAGE_READ':
      return 'communication.timeline.read';
    case 'MESSAGE_FAILED':
      return 'communication.timeline.deliveryFailed';
    case 'HUMAN_ASSIGNED':
      return 'communication.timeline.humanAssigned';
    case 'HUMAN_TAKEOVER':
      return 'communication.timeline.humanTakeover';
    case 'HUMAN_REQUIRED':
      return 'communication.timeline.humanRequired';
    case 'CONVERSATION_RESOLVED':
      return 'communication.timeline.conversationResolved';
    case 'CONVERSATION_REOPENED':
      return 'communication.timeline.conversationReopened';
    case 'AI_ACTION_STARTED':
      return 'communication.timeline.aiActionStarted';
    case 'AI_ACTION_COMPLETED':
      return 'communication.timeline.aiActionCompleted';
    case 'AI_ACTION_FAILED':
      return 'communication.timeline.aiActionFailed';
    case 'AI_INTENT_DETECTED':
      return 'communication.timeline.aiIntentDetected';
    case 'PROVIDER_ERROR':
      return 'communication.timeline.providerError';
    default:
      return 'communication.timeline.systemEvent';
  }
}

export function callEventLabelKey(
  eventType: CommunicationApiEventType,
  direction: CommunicationApiDirection | null,
): TranslationKey {
  switch (eventType) {
    case 'CALL_STARTED':
      return direction === 'OUTBOUND'
        ? 'communication.timeline.outboundCall'
        : 'communication.timeline.inboundCall';
    case 'CALL_CONNECTED':
      return 'communication.timeline.callConnected';
    case 'CALL_ENDED':
      return 'communication.timeline.callCompleted';
    case 'CALL_FAILED':
      return 'communication.timeline.callFailed';
    default:
      return 'communication.timeline.call';
  }
}

export function formatDurationSeconds(seconds: number, locale: string): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (minutes === 0) {
    return new Intl.NumberFormat(locale).format(remainder) + 's';
  }
  return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
}
