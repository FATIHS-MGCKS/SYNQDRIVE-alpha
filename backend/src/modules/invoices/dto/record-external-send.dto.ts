import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { InvoiceExternalSendChannel } from '@prisma/client';

export class RecordExternalSendDto {
  @IsEnum(InvoiceExternalSendChannel)
  channel!: InvoiceExternalSendChannel;

  @IsISO8601()
  sentAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  recipient?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  externalReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
