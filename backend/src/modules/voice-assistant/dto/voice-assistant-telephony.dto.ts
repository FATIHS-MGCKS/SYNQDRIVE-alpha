import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class AssignPhoneNumberDto {
  @IsString()
  @MinLength(1)
  phoneNumberId!: string;
}

export class UpdateTelephonySettingsDto {
  @IsOptional()
  @IsBoolean()
  telephonyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  inboundEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  outboundEnabled?: boolean;
}
