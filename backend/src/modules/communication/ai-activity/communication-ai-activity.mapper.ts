import {
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
} from '@prisma/client';
import type { CommunicationConversationListRow } from '../read/communication-read.mapper';
import {
  communicationUserDisplayName,
  mapCustomerRef,
  UNKNOWN_CONTACT_DISPLAY_LABEL,
} from '../read/communication-read.mapper';
import type { CanonicalCommunicationMetadata } from '../normalization/communication-metadata';
import type {
  CommunicationAiActivityHandoffDto,
  CommunicationAiActivityItemDto,
  CommunicationAiActivityToolDto,
  CommunicationAiActivityType,
  CommunicationAiToolOutcome,
} from './dto/communication-ai-activity-response.dto';

export interface CommunicationAiActivityEventRow {
  id: string;
  eventType: CommunicationEventType;
  occurredAt: Date;
  providerIdentity: string | null;
  metadata: unknown;
  conversation: CommunicationConversationListRow;
}

export function mapContactDisplay(conversation: CommunicationConversationListRow): string {
  const customer = mapCustomerRef(conversation.customer);
  if (customer?.displayName) {
    return customer.displayName;
  }
  const meta = conversation.metadata as { contactDisplay?: string } | null;
  if (meta?.contactDisplay?.trim()) {
    return meta.contactDisplay.trim();
  }
  return UNKNOWN_CONTACT_DISPLAY_LABEL;
}

function metadataString(
  value: string | number | boolean | null | undefined,
): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : String(value);
}

export function mapAiActivityType(eventType: CommunicationEventType): CommunicationAiActivityType {
  switch (eventType) {
    case CommunicationEventType.AI_INTENT_DETECTED:
      return 'AI_INTENT';
    case CommunicationEventType.AI_ACTION_STARTED:
    case CommunicationEventType.AI_ACTION_COMPLETED:
      return 'AI_TOOL';
    case CommunicationEventType.AI_ACTION_FAILED:
      return 'AI_FAILURE';
    case CommunicationEventType.HUMAN_REQUIRED:
      return 'HANDOFF_REQUESTED';
    case CommunicationEventType.HUMAN_ASSIGNED:
    case CommunicationEventType.HUMAN_TAKEOVER:
      return 'HANDOFF_ACCEPTED';
    default:
      return 'AI_COMPLETED';
  }
}

export function mapToolOutcome(eventType: CommunicationEventType): CommunicationAiToolOutcome {
  switch (eventType) {
    case CommunicationEventType.AI_ACTION_COMPLETED:
      return 'SUCCESS';
    case CommunicationEventType.AI_ACTION_FAILED:
      return 'FAILED';
    case CommunicationEventType.AI_ACTION_STARTED:
      return 'UNKNOWN';
    default:
      return 'UNKNOWN';
  }
}

export function buildAiActivitySummary(
  eventType: CommunicationEventType,
  metadata: CanonicalCommunicationMetadata,
  channel: CommunicationChannel,
): string {
  const channelLabel = channel === CommunicationChannel.VOICE ? 'Voice' : channel === CommunicationChannel.WHATSAPP ? 'WhatsApp' : channel;
  switch (eventType) {
    case CommunicationEventType.AI_INTENT_DETECTED:
      return metadata.intentCode
        ? `AI classified customer intent (${metadata.intentCode})`
        : 'AI analyzed customer message';
    case CommunicationEventType.AI_ACTION_STARTED:
      return metadata.toolName
        ? `AI tool started: ${metadata.toolName}`
        : 'AI tool execution started';
    case CommunicationEventType.AI_ACTION_COMPLETED:
      return metadata.toolName
        ? `AI tool completed: ${metadata.toolName}`
        : 'AI tool execution completed';
    case CommunicationEventType.AI_ACTION_FAILED:
      return metadata.toolName
        ? `AI tool failed: ${metadata.toolName}`
        : 'AI tool execution failed';
    case CommunicationEventType.HUMAN_REQUIRED:
      return `Human assistance requested (${channelLabel})`;
    case CommunicationEventType.HUMAN_ASSIGNED:
      return 'Conversation assigned to operator';
    case CommunicationEventType.HUMAN_TAKEOVER:
      return 'Operator took over conversation';
    default:
      return 'AI communication activity';
  }
}

export function buildHandoffDto(
  eventType: CommunicationEventType,
  metadata: CanonicalCommunicationMetadata,
  conversation: CommunicationConversationListRow,
  options?: { handoffResolved?: boolean },
): CommunicationAiActivityHandoffDto | undefined {
  if (
    eventType !== CommunicationEventType.HUMAN_REQUIRED
    && eventType !== CommunicationEventType.HUMAN_ASSIGNED
    && eventType !== CommunicationEventType.HUMAN_TAKEOVER
  ) {
    return undefined;
  }

  const resolved =
    eventType !== CommunicationEventType.HUMAN_REQUIRED
      ? true
      : options?.handoffResolved === true;

  const acceptedBy =
    conversation.assignedUser
      ? communicationUserDisplayName(conversation.assignedUser)
      : null;

  return {
    requested: eventType === CommunicationEventType.HUMAN_REQUIRED,
    reason: metadataString(metadata.handoffReasonCode),
    resolved,
    acceptedBy: eventType === CommunicationEventType.HUMAN_REQUIRED ? null : acceptedBy,
  };
}

export function buildToolDto(
  eventType: CommunicationEventType,
  metadata: CanonicalCommunicationMetadata,
): CommunicationAiActivityToolDto | undefined {
  if (
    eventType !== CommunicationEventType.AI_ACTION_STARTED
    && eventType !== CommunicationEventType.AI_ACTION_COMPLETED
    && eventType !== CommunicationEventType.AI_ACTION_FAILED
  ) {
    return undefined;
  }
  const name = metadataString(metadata.toolName ?? metadata.actionName);
  if (!name) return undefined;
  return {
    name,
    outcome: mapToolOutcome(eventType),
  };
}

export function mapAiActivityEventRow(
  row: CommunicationAiActivityEventRow,
  options?: { handoffResolved?: boolean },
): CommunicationAiActivityItemDto {
  const metadata = (row.metadata ?? {}) as CanonicalCommunicationMetadata;
  const activityType = mapAiActivityType(row.eventType);
  const agentKind =
    row.eventType === CommunicationEventType.HUMAN_ASSIGNED
    || row.eventType === CommunicationEventType.HUMAN_TAKEOVER
      ? 'HUMAN'
      : 'AI';

  let agentDisplayName: string | null = null;
  if (agentKind === 'HUMAN' && row.conversation.assignedUser) {
    agentDisplayName = communicationUserDisplayName(row.conversation.assignedUser);
  } else if (row.conversation.channel === CommunicationChannel.WHATSAPP) {
    agentDisplayName = 'WhatsApp AI';
  } else if (row.conversation.channel === CommunicationChannel.VOICE) {
    agentDisplayName = 'Voice AI';
  }

  return {
    id: row.id,
    conversationId: row.conversation.id,
    channel: row.conversation.channel,
    activityType,
    eventType: row.eventType,
    occurredAt: row.occurredAt.toISOString(),
    summary: buildAiActivitySummary(row.eventType, metadata, row.conversation.channel),
    outcome: metadataString(metadata.failureCode ?? metadata.outcomeCode),
    contactDisplay: mapContactDisplay(row.conversation),
    stationId: row.conversation.stationId,
    conversationStatus: row.conversation.status,
    agent: {
      id: row.conversation.assignedAgentRef ?? row.conversation.assignedUserId,
      displayName: agentDisplayName,
      kind: agentKind,
    },
    provider: row.providerIdentity
      ? {
          identity: row.providerIdentity as CommunicationProviderIdentity,
          role: null,
        }
      : undefined,
    tool: buildToolDto(row.eventType, metadata),
    handoff: buildHandoffDto(row.eventType, metadata, row.conversation, options),
  };
}
