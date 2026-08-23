import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { trimEmptyToUndefined } from '../../../read/dto/communication-read-shared.dto';

export class CommunicationVoiceCreateTaskDto {
  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(4_000)
  description?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  idempotencyKey?: string;
}
