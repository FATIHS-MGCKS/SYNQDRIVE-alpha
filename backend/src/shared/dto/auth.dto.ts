import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

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

export class SeedAdminHeaderDto {
  @IsString()
  @MinLength(1)
  'x-seed-token': string;
}
