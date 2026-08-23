import { CommunicationEventType } from '@prisma/client';

const HANDOFF_RESOLUTION_EVENT_TYPES: CommunicationEventType[] = [
  CommunicationEventType.HUMAN_ASSIGNED,
  CommunicationEventType.HUMAN_TAKEOVER,
];

export interface HandoffResolutionEventRef {
  conversationId: string;
  occurredAt: Date;
  id: string;
}

export interface HandoffRequestRef {
  id: string;
  conversationId: string;
  occurredAt: Date;
}

export function buildHandoffResolutionMap(
  handoffRequests: HandoffRequestRef[],
  resolutionEvents: HandoffResolutionEventRef[],
): Map<string, boolean> {
  const resolutionsByConversation = new Map<string, HandoffResolutionEventRef[]>();
  for (const event of resolutionEvents) {
    const bucket = resolutionsByConversation.get(event.conversationId) ?? [];
    bucket.push(event);
    resolutionsByConversation.set(event.conversationId, bucket);
  }

  const map = new Map<string, boolean>();
  for (const request of handoffRequests) {
    const resolutions = resolutionsByConversation.get(request.conversationId) ?? [];
    const resolved = resolutions.some(
      (resolution) =>
        resolution.occurredAt > request.occurredAt
        || (
          resolution.occurredAt.getTime() === request.occurredAt.getTime()
          && resolution.id > request.id
        ),
    );
    map.set(request.id, resolved);
  }
  return map;
}

export { HANDOFF_RESOLUTION_EVENT_TYPES };
