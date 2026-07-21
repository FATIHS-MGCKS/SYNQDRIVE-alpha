import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Min,
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

export class PreviewRoleChangeDto extends UpdateOrganizationRoleDto {}

export class ApplyRoleChangeDto {
  @IsString()
  @MinLength(64)
  @MaxLength(128)
  previewHash!: string;

  changes!: UpdateOrganizationRoleDto;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsOptional()
  @IsBoolean()
  stepUpConfirmed?: boolean;

  @IsInt()
  @Min(0)
  expectedRoleVersion!: number;
}
