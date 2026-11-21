import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { BusinessType, OrganizationStatus } from '@prisma/client';
import {
  SUPPORTED_LEGAL_FORMS,
  SUPPORTED_ORG_LANGUAGES,
} from '../utils/tenant-profile-normalizer.util';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const nullIfEmpty = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length > 0 ? t : null;
};

/**
 * Master Admin — PATCH /admin/organizations/:id.
 * Explicit allow-list; unknown properties rejected by global ValidationPipe.
 *
 * Excluded (use dedicated routes or are system-owned):
 * id, paymentsEnabled, nextInvoiceNumber, legalDocumentFourEyesEnabled,
 * createdAt, updatedAt, lastActiveAt, relations.
 */
export class AdminUpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(trim)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(nullIfEmpty)
  shortCode?: string | null;

  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(nullIfEmpty)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(nullIfEmpty)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(nullIfEmpty)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(nullIfEmpty)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(nullIfEmpty)
  state?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(nullIfEmpty)
  zip?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(nullIfEmpty)
  country?: string | null;

  @IsOptional()
  @Transform(nullIfEmpty)
  @IsUrl({ require_protocol: true }, { message: 'website must be a valid URL' })
  @MaxLength(500)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(nullIfEmpty)
  timezone?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_ORG_LANGUAGES])
  @Transform(nullIfEmpty)
  language?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(nullIfEmpty)
  managerName?: string | null;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(nullIfEmpty)
  managerEmail?: string | null;

  @IsOptional()
  @Transform(nullIfEmpty)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(nullIfEmpty)
  legalCompanyName?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LEGAL_FORMS])
  @Transform(nullIfEmpty)
  legalForm?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(nullIfEmpty)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(nullIfEmpty)
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(nullIfEmpty)
  vatId?: string | null;

  @IsOptional()
  @IsBoolean()
  isSmallBusiness?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  defaultVatRate?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(nullIfEmpty)
  invoicePrefix?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  @Type(() => Number)
  paymentTermsDays?: number;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(nullIfEmpty)
  invoiceEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(nullIfEmpty)
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(34)
  @Transform(nullIfEmpty)
  iban?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(nullIfEmpty)
  bic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(nullIfEmpty)
  pdfFooterText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(nullIfEmpty)
  emailSignature?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(nullIfEmpty)
  accentColor?: string | null;

  @IsOptional()
  @Transform(nullIfEmpty)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  logoDarkUrl?: string | null;

  @IsOptional()
  @Transform(nullIfEmpty)
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  pdfLogoUrl?: string | null;
}