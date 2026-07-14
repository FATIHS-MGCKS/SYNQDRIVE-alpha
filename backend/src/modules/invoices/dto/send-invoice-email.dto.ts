import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendInvoiceEmailDto {
  @IsEmail()
  toEmail!: string;

  @IsString()
  subject!: string;

  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  bodyText?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  ccEmails?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bccEmails?: string[];

  @IsOptional()
  @IsUUID()
  documentId?: string;
}
