import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { PERMISSION_MODULE_KEYS } from '@shared/auth/permission.constants';
import {
  IsMembershipPermissions,
  IsStationIds,
} from './membership-validators';
import { IsOptionalPassword } from './password.validator';

const MEMBERSHIP_ROLES = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
] as const;

export class CreateOrgUserDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName!: string;

  @IsIn(MEMBERSHIP_ROLES)
  role!: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  organizationRoleId?: string;

  @IsOptionalPassword()
  password?: string;

  @IsOptional()
  @IsBoolean()
  inviteByEmail?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;

  /** Legacy single-station scope (station id or label). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationScope?: string;

  @IsOptional()
  @IsStationIds()
  stationIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dateFormat?: string;

  @IsOptional()
  @IsMembershipPermissions()
  permissions?: Record<string, { read: boolean; write: boolean; manage?: boolean }>;

  @IsOptional()
  @IsBoolean()
  fieldAgentAccess?: boolean;
}

export class UpdateOrgUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  mobile?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;

  @IsOptional()
  @IsIn(MEMBERSHIP_ROLES)
  role?: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationScope?: string;

  @IsOptional()
  @IsStationIds()
  stationIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(16)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  dateFormat?: string;

  @IsOptional()
  @IsMembershipPermissions()
  permissions?: Record<string, { read: boolean; write: boolean; manage?: boolean }>;

  @IsOptional()
  @IsBoolean()
  fieldAgentAccess?: boolean;

  @IsOptional()
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status?: 'ACTIVE' | 'SUSPENDED';
}

export class ChangeOrgUserPasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class CreateMembershipDto {
  @IsIn(MEMBERSHIP_ROLES)
  role!: (typeof MEMBERSHIP_ROLES)[number];
}

export class AdminCreateUserDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class AdminUpdateUserDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}

export class AdminChangePasswordDto {
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

/** Ensures permission keys are from the canonical registry at validation time. */
export const KNOWN_PERMISSION_MODULES = PERMISSION_MODULE_KEYS;
