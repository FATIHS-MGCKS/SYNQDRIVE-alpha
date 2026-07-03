import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

const ACCOUNT_PASSWORD_MIN_LENGTH = 10;

export class ChangeMyPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(ACCOUNT_PASSWORD_MIN_LENGTH)
  newPassword!: string;

  @IsString()
  @MinLength(ACCOUNT_PASSWORD_MIN_LENGTH)
  confirmPassword!: string;

  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;
}
