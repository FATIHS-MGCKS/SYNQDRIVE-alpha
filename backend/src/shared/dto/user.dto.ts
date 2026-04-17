import {
  IsEmail, IsString, IsOptional, IsEnum, IsBoolean,
  MinLength, MaxLength, Matches,
} from 'class-validator';

export enum MembershipRoleDto {
  ORG_ADMIN = 'ORG_ADMIN',
  SUB_ADMIN = 'SUB_ADMIN',
  WORKER = 'WORKER',
  DRIVER = 'DRIVER',
}

/**
 * Minimum password length across the product. 10 characters is the lowest
 * sensible floor for ISO 27001 A.9.4 / NIST SP 800-63B (which permits 8 if
 * complexity checks are enforced — we choose 10 + complexity for a larger
 * safety margin and to align with BSI TR-02102-1 guidance in DE).
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * At least one lowercase letter, one uppercase letter, one digit, and one
 * non-alphanumeric character. Total length is enforced separately by
 * `@MinLength(PASSWORD_MIN_LENGTH)`. We deliberately avoid banning common
 * passwords here — that check lives in the application service layer where
 * we can swap in an HIBP lookup.
 */
export const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
export const PASSWORD_COMPLEXITY_MESSAGE =
  'Password must contain at least one uppercase letter, one lowercase letter, one digit and one special character';

export class CreateOrgUserInputDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
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
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password: string;
}
