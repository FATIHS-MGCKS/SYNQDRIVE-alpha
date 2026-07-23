import { ArrayNotEmpty, IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendFrozenBookingDocumentsEmailDto {
  @IsEmail()
  toEmail!: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bccEmails?: string[];

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  documentIds?: string[];
}
