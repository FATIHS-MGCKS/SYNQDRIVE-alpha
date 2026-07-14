import { IsArray, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsEmail()
  recipient?: string;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  bcc?: string[];

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsUUID('4')
  documentId?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
