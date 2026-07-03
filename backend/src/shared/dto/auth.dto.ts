import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email: string;

  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(1, { message: 'Refresh token is required' })
  refreshToken: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class VerifyMfaLoginDto {
  @IsString()
  @MinLength(1)
  mfaChallengeToken!: string;

  @IsOptional()
  @IsString()
  totpCode?: string;

  @IsOptional()
  @IsString()
  recoveryCode?: string;
}

export class SeedAdminHeaderDto {
  @IsString()
  @MinLength(1)
  'x-seed-token': string;
}
