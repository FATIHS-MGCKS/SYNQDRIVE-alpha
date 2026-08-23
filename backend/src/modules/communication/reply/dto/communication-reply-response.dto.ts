import type { CommunicationConversationDetailDto } from '../../read/dto/communication-read-response.dto';
import type { CommunicationEventDto } from '../../read/dto/communication-read-response.dto';

export type CommunicationReplySendState = 'ACCEPTED' | 'PENDING' | 'FAILED' | 'UNKNOWN';

export class CommunicationReplyResponseDto {
  conversation!: CommunicationConversationDetailDto;
  sendState!: CommunicationReplySendState;
  event?: CommunicationEventDto | null;
  commandId!: string;
}
