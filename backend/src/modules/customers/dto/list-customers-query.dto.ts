import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  CustomerRiskLevel,
  CustomerStatus,
  CustomerType,
  CustomerVerificationStatus,
} from '@prisma/client';
import { PaginationParams } from '@shared/utils/pagination';

const toBool = (v: unknown) => {
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  return undefined;
};

export class ListCustomersQueryDto implements PaginationParams {
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsEnum(CustomerRiskLevel)
  riskLevel?: CustomerRiskLevel;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  /** Filter by ID or license verification status. */
  @IsOptional()
  @IsEnum(CustomerVerificationStatus)
  verificationStatus?: CustomerVerificationStatus;

  @IsOptional()
  @IsIn(['id', 'license'])
  verificationTarget?: 'id' | 'license';

  @IsOptional()
  @IsDateString()
  licenseExpiringBefore?: string;

  @IsOptional()
  @Transform(({ value }) => toBool(value))
  @IsBoolean()
  includeArchived?: boolean;
}

export class CheckCustomerDuplicatesQueryDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}
