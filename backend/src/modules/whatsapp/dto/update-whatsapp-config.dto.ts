import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { WhatsAppAiMode } from '@prisma/client';

export class UpdateWhatsAppConfigDto {
  @IsOptional()
  @IsEnum(WhatsAppAiMode)
  aiMode?: WhatsAppAiMode;

  @IsOptional()
  @IsBoolean()
  aiCanCreateTasks?: boolean;

  @IsOptional()
  @IsBoolean()
  aiCanCreateSupport?: boolean;

  @IsOptional()
  @IsBoolean()
  aiCanUseBookings?: boolean;

  @IsOptional()
  @IsBoolean()
  aiCanContactVendors?: boolean;

  @IsOptional()
  @IsBoolean()
  aiEscalationEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  wabaId?: string;

  @IsOptional()
  @IsString()
  webhookVerifyToken?: string;

  @IsOptional()
  @IsBoolean()
  accessTokenConfigured?: boolean;

  @IsOptional()
  @IsBoolean()
  appSecretConfigured?: boolean;

  @IsOptional()
  @IsBoolean()
  serviceWindowOpen?: boolean;
}
