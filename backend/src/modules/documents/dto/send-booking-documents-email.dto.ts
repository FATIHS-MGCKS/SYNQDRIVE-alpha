import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendBookingDocumentsEmailDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  documentIds!: string[];

  @IsOptional()
  @IsEmail()
  to?: string;

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
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  message?: string;

  @IsOptional()
  @IsBoolean()
  includeSignature?: boolean;
}
