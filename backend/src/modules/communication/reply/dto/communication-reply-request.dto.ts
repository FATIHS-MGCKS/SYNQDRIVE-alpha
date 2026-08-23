import { IsString, MaxLength, MinLength } from 'class-validator';
import {
  COMMUNICATION_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH,
  COMMUNICATION_REPLY_TEXT_MAX_LENGTH,
} from '../communication-reply.constants';

export class CommunicationReplyRequestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(COMMUNICATION_REPLY_TEXT_MAX_LENGTH)
  text!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(COMMUNICATION_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH)
  idempotencyKey!: string;
}
