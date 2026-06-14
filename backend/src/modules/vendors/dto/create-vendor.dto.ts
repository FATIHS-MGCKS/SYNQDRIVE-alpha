import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  VendorCategory,
  VendorSource,
  VendorSourceType,
} from '@prisma/client';

/**
 * Create a vendor (external service provider) master record.
 *
 * Deliberately does NOT accept `vehicleIds` — vehicle links are managed
 * exclusively through the dedicated link endpoints. The global ValidationPipe
 * runs with `forbidNonWhitelisted: true`, so any stray `vehicleIds` in the body
 * is rejected with 400 rather than silently mutating links.
 */
export class CreateVendorDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsEnum(VendorCategory)
  category?: VendorCategory;

  @IsOptional()
  @IsEnum(VendorSourceType)
  sourceType?: VendorSourceType;

  @IsOptional()
  @IsEnum(VendorSource)
  source?: VendorSource;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  externalPlaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  addressLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  country?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(256)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceAreas?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(256)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  contactNotes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
