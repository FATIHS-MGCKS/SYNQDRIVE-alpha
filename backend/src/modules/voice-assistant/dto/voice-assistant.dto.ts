import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  VoiceConversationDirection,
  VoiceConversationOutcome,
  VoiceConversationStatus,
} from '@prisma/client';

const PHONE_PATTERN = /^\+?[0-9][0-9\s\-().]{5,24}$/;

export class UpdateVoiceAssistantDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  personality?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  voiceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  voiceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  greetingMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  companyContext?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  businessRules?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  forbiddenActions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32000)
  knowledgeSnippets?: string;

  @IsOptional()
  @IsBoolean()
  telephonyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inboundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  outboundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  permAnswerQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  permManageBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  permCreateBookingDrafts?: boolean;

  @IsOptional()
  @IsBoolean()
  permCancelBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  permCreateTasks?: boolean;

  @IsOptional()
  @IsBoolean()
  permWorkshopHandling?: boolean;

  @IsOptional()
  @IsBoolean()
  permBreakdownSupport?: boolean;

  @IsOptional()
  @IsBoolean()
  permContactCustomers?: boolean;

  @IsOptional()
  @IsBoolean()
  permContactVendors?: boolean;

  @IsOptional()
  @IsBoolean()
  permModifyRecords?: boolean;

  @IsOptional()
  @IsBoolean()
  permCreateActions?: boolean;

  @IsOptional()
  @IsBoolean()
  permEmergencyHandling?: boolean;

  @IsOptional()
  @IsObject()
  toolPermissions?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(PHONE_PATTERN, { message: 'escalationPhone must be a valid phone number' })
  escalationPhone?: string;

  @IsOptional()
  @IsUUID('4')
  escalationUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  escalationDepartment?: string;

  @IsOptional()
  @IsBoolean()
  escalateOnLowConf?: boolean;

  @IsOptional()
  @IsBoolean()
  escalateOnSensitive?: boolean;

  @IsOptional()
  @IsBoolean()
  escalateOnRequest?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fallbackMessage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  escalationTriggers?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(8)
  businessHoursStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  businessHoursEnd?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessHoursTimezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  afterHoursMessage?: string;

  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown>;
}

export class ListVoiceConversationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsIn(Object.values(VoiceConversationOutcome))
  outcome?: VoiceConversationOutcome;

  @IsOptional()
  @IsIn(Object.values(VoiceConversationDirection))
  direction?: VoiceConversationDirection;

  @IsOptional()
  @IsIn(Object.values(VoiceConversationStatus))
  status?: VoiceConversationStatus;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  escalatedOnly?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  hasTranscript?: boolean;
}
