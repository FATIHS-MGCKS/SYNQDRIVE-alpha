import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

export class VerifyTotpCodeDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}

export class DisableTotpDto {
  @ValidateIf((dto: DisableTotpDto) => !dto.totpCode)
  @IsString()
  currentPassword?: string;

  @ValidateIf((dto: DisableTotpDto) => !dto.currentPassword)
  @IsOptional()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  totpCode?: string;
}

export class RegenerateRecoveryCodesDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  totpCode!: string;
}
