import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePlatformEmailSettingsDto {
  @IsEmail()
  @MaxLength(320)
  defaultFromEmail!: string;

  @IsString()
  @MaxLength(120)
  defaultFromName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  defaultReplyToEmail?: string | null;
}
