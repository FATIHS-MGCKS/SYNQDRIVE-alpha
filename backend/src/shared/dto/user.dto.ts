import {
  IsEmail, IsString, IsOptional, IsEnum, IsBoolean,
  MinLength, MaxLength,
} from 'class-validator';

export enum MembershipRoleDto {
  ORG_ADMIN = 'ORG_ADMIN',
  SUB_ADMIN = 'SUB_ADMIN',
  WORKER = 'WORKER',
  DRIVER = 'DRIVER',
}

export class CreateOrgUserInputDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128)
  password?: string;

  @IsEnum(MembershipRoleDto)
  role: MembershipRoleDto;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  position?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  fieldAgentAccess?: boolean;
}

export class UpdateOrgUserInputDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(MembershipRoleDto)
  role?: MembershipRoleDto;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  position?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsBoolean()
  fieldAgentAccess?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  @MaxLength(128)
  password: string;
}
