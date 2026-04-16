import {
  IsString, IsOptional, IsEmail, IsEnum, IsUrl,
  MaxLength, MinLength,
} from 'class-validator';

export enum BusinessTypeDto {
  RENTAL = 'RENTAL',
  FLEET = 'FLEET',
  TAXI = 'TAXI',
  LOGISTICS = 'LOGISTICS',
  OTHER = 'OTHER',
}

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName: string;

  @IsOptional()
  @IsEnum(BusinessTypeDto)
  businessType?: BusinessTypeDto;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}

export class CreateOrgAdminDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(128)
  password: string;
}
