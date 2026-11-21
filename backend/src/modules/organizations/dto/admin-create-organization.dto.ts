import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BusinessType, OrganizationStatus } from '@prisma/client';
import { OrganizationInitialAdminDto } from './organization-initial-admin.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Master Admin — POST /admin/organizations.
 * Matches OrganizationCreateWizard + App.tsx payloads.
 */
export class AdminCreateOrganizationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Transform(trim)
  companyName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Transform(trim)
  shortCode?: string;

  @IsOptional()
  @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(trim)
  email?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(trim)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(trim)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Transform(trim)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  website?: string;

  @IsOptional()
  @IsEnum(OrganizationStatus)
  status?: OrganizationStatus;

  /** When set, org + admin + membership are created atomically in one request. */
  @IsOptional()
  @ValidateNested()
  @Type(() => OrganizationInitialAdminDto)
  initialAdmin?: OrganizationInitialAdminDto;
}