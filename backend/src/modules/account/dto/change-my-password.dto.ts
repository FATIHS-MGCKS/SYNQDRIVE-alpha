import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class ChangeMyPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;

  @IsString()
  @MinLength(6)
  confirmPassword!: string;

  @IsOptional()
  @IsBoolean()
  revokeOtherSessions?: boolean;
}
