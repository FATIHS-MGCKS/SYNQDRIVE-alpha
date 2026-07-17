import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class TwilioProvisioningPreviewDto {
  @IsOptional()
  @IsIn(['local', 'mobile'])
  numberType?: 'local' | 'mobile';
}

export class TwilioSubaccountProvisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  friendlyName?: string;

  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class TwilioPhoneNumberSearchDto {
  @IsOptional()
  @IsIn(['local', 'mobile'])
  numberType?: 'local' | 'mobile';

  @IsOptional()
  @IsString()
  @MaxLength(8)
  areaCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contains?: string;

  @IsOptional()
  limit?: number;
}

export class TwilioPhoneNumberPurchaseDto {
  @IsString()
  @MaxLength(24)
  phoneNumber!: string;

  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class TwilioCredentialRegisterDto {
  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
