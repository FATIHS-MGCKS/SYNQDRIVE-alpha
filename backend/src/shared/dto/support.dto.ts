import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsEmail,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  SupportMessageSenderRole,
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketRelatedEntityType,
  SupportTicketStatus,
} from '@prisma/client';

export function trimEmptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
}

export class SupportAttachmentRefDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}

export class CreateSupportTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsEnum(SupportTicketRelatedEntityType)
  relatedEntityType?: SupportTicketRelatedEntityType;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(120)
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourcePage?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportAttachmentRefDto)
  attachments?: SupportAttachmentRefDto[];
}

export class AdminCreateSupportTicketDto {
  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  organizationId?: string;

  @IsEmail()
  reporterEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reporterName?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  assignedToUserId?: string | null;
}

export class CreateSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  /** @deprecated use body */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupportAttachmentRefDto)
  attachments?: SupportAttachmentRefDto[];
}

export class CreateInternalNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class QuerySupportTicketsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsEnum(SupportTicketStatus)
  status?: SupportTicketStatus;

  @IsOptional()
  @IsEnum(SupportTicketPriority)
  priority?: SupportTicketPriority;

  @IsOptional()
  @IsEnum(SupportTicketCategory)
  category?: SupportTicketCategory;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  organizationId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsEnum(SupportTicketRelatedEntityType)
  relatedEntityType?: SupportTicketRelatedEntityType;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  relatedEntityId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasUnread?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  openOnly?: boolean;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  createdFrom?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  createdTo?: string;
}

/** Legacy status patch DTO — maps to admin update. */
export class UpdateTicketStatusDto {
  @IsEnum(SupportTicketStatus)
  status!: SupportTicketStatus;
}

/** Backward-compat alias */
export class AddSupportMessageDto extends CreateSupportMessageDto {}

export {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
  SupportTicketRelatedEntityType,
  SupportMessageSenderRole,
};
