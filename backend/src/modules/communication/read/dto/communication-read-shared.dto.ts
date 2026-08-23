import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  CommunicationChannel,
  CommunicationConversationStatus,
  CommunicationProviderIdentity,
  VoiceConversationDirection,
  VoiceConversationOutcome,
} from '@prisma/client';
import {
  COMMUNICATION_INBOX_MAX_LIMIT,
  COMMUNICATION_TIMELINE_MAX_LIMIT,
} from '../communication-read.cursor.util';

export function trimEmptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
}

export function parseCommaSeparatedEnum<T extends string>(
  value: unknown,
): T[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const items = raw.map((entry) => String(entry).trim()).filter(Boolean);
  return items.length > 0 ? (items as T[]) : undefined;
}

export class CommunicationCustomerRefDto {
  id!: string;
  displayName!: string;
}

export class CommunicationBookingRefDto {
  id!: string;
  reference!: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

export class CommunicationVehicleRefDto {
  id!: string;
  displayLabel!: string;
}

export class CommunicationStationRefDto {
  id!: string;
  name!: string;
}

export class CommunicationAssignedUserRefDto {
  id!: string;
  displayName!: string;
}

export class CommunicationAssignedAgentRefDto {
  ref!: string;
  type?: string | null;
}

export class CommunicationConversationListQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseCommaSeparatedEnum<CommunicationChannel>(value))
  @IsEnum(CommunicationChannel, { each: true })
  channel?: CommunicationChannel[];

  @IsOptional()
  @Transform(({ value }) => parseCommaSeparatedEnum<CommunicationConversationStatus>(value))
  @IsEnum(CommunicationConversationStatus, { each: true })
  status?: CommunicationConversationStatus[];

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unassigned?: boolean;

  @IsOptional()
  @Transform(({ value }) => parseCommaSeparatedEnum<CommunicationProviderIdentity>(value))
  @IsEnum(CommunicationProviderIdentity, { each: true })
  providerIdentity?: CommunicationProviderIdentity[];

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(64)
  intent?: string;

  @IsOptional()
  @IsEnum(VoiceConversationDirection)
  callDirection?: VoiceConversationDirection;

  @IsOptional()
  @IsEnum(VoiceConversationOutcome)
  callOutcome?: VoiceConversationOutcome;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  callHasTranscript?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  callEscalatedOnly?: boolean;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COMMUNICATION_INBOX_MAX_LIMIT)
  limit?: number;
}

export class CommunicationAttentionPreviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class CommunicationEventListQueryDto {
  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(COMMUNICATION_TIMELINE_MAX_LIMIT)
  limit?: number;
}
