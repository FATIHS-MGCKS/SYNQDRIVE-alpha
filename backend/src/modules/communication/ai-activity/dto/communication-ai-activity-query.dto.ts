import { CommunicationChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { CommunicationAiActivityFilterCategory } from '../communication-ai-activity.constants';

export class CommunicationAiActivityListQueryDto {
  @IsOptional()
  @IsEnum(CommunicationChannel)
  channel?: CommunicationChannel;

  @IsOptional()
  @IsString()
  category?: CommunicationAiActivityFilterCategory;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number;
}
