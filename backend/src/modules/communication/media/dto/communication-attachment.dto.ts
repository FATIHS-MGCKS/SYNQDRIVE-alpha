import { CommunicationAttachmentMediaType, CommunicationAttachmentState } from '@prisma/client';

export class CommunicationAttachmentDto {
  id!: string;
  fileName!: string;
  mimeType!: string;
  sizeBytes!: number;
  mediaType!: CommunicationAttachmentMediaType;
  state!: CommunicationAttachmentState;
}
