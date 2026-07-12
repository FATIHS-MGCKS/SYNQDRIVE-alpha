import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { OrgEmailMode } from '@prisma/client';

export class UpdateOrgEmailSettingsDto {
  @IsOptional()
  @IsEnum(OrgEmailMode)
  mode?: OrgEmailMode;

  @IsOptional()
  @IsString()
  defaultFromName?: string | null;

  @IsOptional()
  @IsEmail()
  replyToEmail?: string | null;

  @IsOptional()
  @IsString()
  signatureHtml?: string | null;

  @IsOptional()
  @IsBoolean()
  autoSendBookingDocumentsOnConfirm?: boolean;
}
