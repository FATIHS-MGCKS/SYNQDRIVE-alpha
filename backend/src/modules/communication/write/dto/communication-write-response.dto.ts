import type { CommunicationConversationDetailDto } from '../../read/dto/communication-read-response.dto';

export class CommunicationMutationResponseDto {
  conversation!: CommunicationConversationDetailDto;
}
