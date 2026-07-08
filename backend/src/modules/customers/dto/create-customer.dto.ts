import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CustomerType } from '@prisma/client';
import { CustomerVerificationPlanDto } from './verification-plan.dto';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  licenseNumber?: string;

  @IsOptional()
  @IsDateString()
  licenseExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  idNumber?: string;

  @IsOptional()
  @IsDateString()
  idExpiry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  /** Override hard duplicate detection when operator explicitly confirms. */
  @IsOptional()
  @IsBoolean()
  allowDuplicateOverride?: boolean;

  /** Planned verification strategy per document domain (canonical via CustomerVerificationCheck). */
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerVerificationPlanDto)
  verificationPlan?: CustomerVerificationPlanDto;
}
