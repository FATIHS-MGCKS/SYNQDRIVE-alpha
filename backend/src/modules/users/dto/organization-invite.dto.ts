import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Equals,
} from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { IsMembershipPermissions, IsStationIds } from './membership-validators';
import { IsOptionalPassword } from './password.validator';

const ROLES = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
  MembershipRole.DRIVER,
] as const;

export class CreateOrganizationInviteDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsIn(ROLES)
  membershipRole?: (typeof ROLES)[number];

  @IsOptional()
  @IsUUID()
  organizationRoleId?: string;

  @IsOptional()
  @IsMembershipPermissions()
  permissions?: Record<string, { read: boolean; write: boolean; manage?: boolean }>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationScope?: string;

  @IsOptional()
  @IsStationIds()
  stationIds?: string[];

  @IsOptional()
  @IsBoolean()
  fieldAgentAccess?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;
}

export class ValidateInviteDto {
  @IsString()
  @MinLength(16)
  token!: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(16)
  token!: string;

  @Equals(true, { message: 'Explicit acceptance confirmation is required' })
  confirmed!: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgeRejoin?: boolean;

  @IsOptional()
  @IsBoolean()
  acknowledgePrivilegedRole?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptionalPassword()
  password?: string;
}
