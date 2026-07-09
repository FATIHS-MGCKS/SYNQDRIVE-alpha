import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrgEmailMode } from '@prisma/client';

export class UpdateOrgEmailSettingsDto {
  @IsOptional()
  @IsEnum(OrgEmailMode)
  mode?: OrgEmailMode;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultFromName?: string | null;

  @IsOptional()
  @IsEmail()
  defaultReplyToEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  signatureHtml?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  signatureText?: string | null;
}
