import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_MIN_LENGTH,
} from '@shared/dto/user.dto';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Optional first org admin for atomic MA onboarding (POST /admin/organizations). */
export class OrganizationInitialAdminDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @Transform(trim)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  @Transform(trim)
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  })
  @MaxLength(128)
  @Matches(PASSWORD_COMPLEXITY_REGEX, { message: PASSWORD_COMPLEXITY_MESSAGE })
  password!: string;
}