import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendDocumentFollowUpContactDto {
  @IsEmail()
  toEmail!: string;

  @IsOptional()
  @IsString({ each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsString({ each: true })
  bccEmails?: string[];

  @IsString()
  @MaxLength(500)
  subject!: string;

  @IsString()
  @MaxLength(50_000)
  bodyHtml!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  bodyText?: string;

  @IsOptional()
  @IsBoolean()
  attachDocument?: boolean;
}
