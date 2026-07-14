import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoicePaymentMethod, OrgInvoiceStatus, OrgInvoiceType } from '@prisma/client';

export class InvoiceLineItemDto {
  @IsString()
  description!: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsInt()
  @Min(0)
  unitPriceNetCents!: number;

  @IsOptional()
  @IsInt()
  taxRate?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;
}

export class CreateInvoiceDto {
  @IsEnum(OrgInvoiceType)
  type!: OrgInvoiceType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems?: InvoiceLineItemDto[];

  /** Fallback when no line items — gross total in cents. */
  @IsOptional()
  @IsInt()
  @Min(0)
  totalCents?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsISO8601()
  invoiceDate?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsUUID()
  documentExtractionId?: string;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems?: InvoiceLineItemDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  totalCents?: number;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsUUID()
  vendorId?: string | null;

  @IsOptional()
  @IsString()
  vendorName?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  templateId?: string;
}

export class RecordInvoicePaymentDto {
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsEnum(InvoicePaymentMethod)
  method!: InvoicePaymentMethod;

  @IsOptional()
  @IsISO8601()
  paidAt?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export * from './invoice-list-item.dto';
export * from './list-invoices-query.dto';

export class InvoiceQueryDto {
  @IsOptional()
  @IsEnum(OrgInvoiceType)
  type?: OrgInvoiceType;

  @IsOptional()
  @IsEnum(OrgInvoiceStatus)
  status?: OrgInvoiceStatus;

  @IsOptional()
  @IsString()
  direction?: 'outgoing' | 'incoming';
}