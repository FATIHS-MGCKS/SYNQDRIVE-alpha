import { IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class AssignPhoneNumberDto {
  @IsString()
  @MinLength(1)
  phoneNumberId!: string;

  @IsOptional()
  @IsIn(['elevenlabs', 'twilio'])
  provider?: 'elevenlabs' | 'twilio';
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

export class InitiateTwilioOutboundCallDto {
  @IsString()
  @MinLength(3)
  to!: string;
}
