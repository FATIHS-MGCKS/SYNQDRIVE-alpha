import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CommunicationReplyContentType } from '@prisma/client';
import {
  COMMUNICATION_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH,
  COMMUNICATION_REPLY_TEXT_MAX_LENGTH,
} from '../communication-reply.constants';

export class CommunicationReplyRequestDto {
  @IsOptional()
  @IsEnum(CommunicationReplyContentType)
  contentType?: CommunicationReplyContentType;

  @ValidateIf((dto: CommunicationReplyRequestDto) => (dto.contentType ?? 'TEXT') === 'TEXT')
  @IsString()
  @MinLength(1)
  @MaxLength(COMMUNICATION_REPLY_TEXT_MAX_LENGTH)
  text?: string;

  @ValidateIf((dto: CommunicationReplyRequestDto) => {
    const type = dto.contentType ?? CommunicationReplyContentType.TEXT;
    return type === CommunicationReplyContentType.IMAGE || type === CommunicationReplyContentType.DOCUMENT;
  })
  @IsUUID()
  attachmentId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(COMMUNICATION_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey!: string;
}
