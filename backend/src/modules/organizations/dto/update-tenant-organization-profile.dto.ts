import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
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
 * Tenant-scoped company profile patch — Settings → Company Information.
 * Only fields listed here may be updated via `/organizations/:orgId/profile`.
 */
export class UpdateTenantOrganizationProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(trim)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(nullIfEmpty)
  legalCompanyName?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...SUPPORTED_LEGAL_FORMS])
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null;
    return typeof value === 'string' ? value.trim().toUpperCase() : value;
  })
  legalForm?: string | null;

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
  @MaxLength(80)
  @Transform(nullIfEmpty)
  country?: string | null;

  /** Legacy combined tax field — kept for backward compatibility */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(nullIfEmpty)
  taxId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(nullIfEmpty)
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(nullIfEmpty)
  vatId?: string | null;

  @IsOptional()
  @IsBoolean()
  isSmallBusiness?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultVatRate?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(nullIfEmpty)
  invoicePrefix?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  nextInvoiceNumber?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  paymentTermsDays?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  @MaxLength(200)
  @Transform(nullIfEmpty)
  invoiceEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(nullIfEmpty)
  bankName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    const t = value.replace(/\s+/g, '').toUpperCase();
    return t.length > 0 ? t : null;
  })
  iban?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Transform(({ value }) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return value;
    const t = value.replace(/\s+/g, '').toUpperCase();
    return t.length > 0 ? t : null;
  })
  bic?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(nullIfEmpty)
  pdfFooterText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @Transform(nullIfEmpty)
  emailSignature?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(nullIfEmpty)
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  @MaxLength(200)
  @Transform(nullIfEmpty)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(nullIfEmpty)
  website?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
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
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsEmail()
  @MaxLength(200)
  @Transform(nullIfEmpty)
  managerEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(nullIfEmpty)
  accentColor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(nullIfEmpty)
  logoDarkUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(nullIfEmpty)
  pdfLogoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(nullIfEmpty)
  logoUrl?: string | null;
}
