import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { MembershipRole } from '@prisma/client';
import { IsMembershipPermissions, IsStationIds } from './membership-validators';

const ROLES = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
  MembershipRole.DRIVER,
] as const;

export class CreateOrganizationRoleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(ROLES)
  membershipRole!: (typeof ROLES)[number];

  @IsOptional()
  @IsMembershipPermissions()
  permissions?: Record<string, { read: boolean; write: boolean; manage?: boolean }>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationScopeDefault?: string;

  @IsOptional()
  @IsStationIds()
  defaultStationIds?: string[];

  @IsOptional()
  @IsBoolean()
  fieldAgentAccessDefault?: boolean;
}

export class UpdateOrganizationRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(ROLES)
  membershipRole?: (typeof ROLES)[number];

  @IsOptional()
  @IsMembershipPermissions()
  permissions?: Record<string, { read: boolean; write: boolean; manage?: boolean }>;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stationScopeDefault?: string;

  @IsOptional()
  @IsStationIds()
  defaultStationIds?: string[];

  @IsOptional()
  @IsBoolean()
  fieldAgentAccessDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignOrganizationRoleDto {
  @IsUUID()
  roleId!: string;
}
