import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MembershipRole } from '@prisma/client';

const MEMBERSHIP_ROLES = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
] as const;

export class GovernanceInitialMembershipDto {
  @IsUUID()
  organizationId!: string;

  @IsIn(MEMBERSHIP_ROLES)
  role!: (typeof MEMBERSHIP_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  inviteByEmail?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  organizationRoleId?: string;
}

export class GovernanceCreateGlobalUserDto {
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  /** Legacy display name when first/last are omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

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
  @ValidateNested()
  @Type(() => GovernanceInitialMembershipDto)
  initialMembership?: GovernanceInitialMembershipDto;

  /**
   * Request credential setup email after provisioning (org membership required).
   * Ignored when inviteByEmail is true on initialMembership.
   */
  @IsOptional()
  @IsBoolean()
  sendCredentialSetup?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  @IsNotEmpty()
  idempotencyKey?: string;
}

export class GovernanceUpdateGlobalProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

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
  @IsString()
  @MaxLength(128)
  @IsNotEmpty()
  idempotencyKey?: string;
}