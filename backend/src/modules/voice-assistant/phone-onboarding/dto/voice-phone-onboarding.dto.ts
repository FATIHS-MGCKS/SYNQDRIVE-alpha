import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SelectPhoneOnboardingPathDto {
  @IsIn(['new_synqdrive_number', 'forward_existing', 'port_number', 'sip_pbx'])
  path!: 'new_synqdrive_number' | 'forward_existing' | 'port_number' | 'sip_pbx';
}

export class SearchPhoneNumbersDto {
  @IsOptional()
  @IsIn(['local', 'mobile'])
  numberType?: 'local' | 'mobile';

  @IsOptional()
  @IsString()
  @MaxLength(8)
  areaCode?: string;

  @IsOptional()
  limit?: number;
}

export class PurchasePhoneNumberDto {
  @IsString()
  @MaxLength(128)
  selectionToken!: string;

  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class UpdateForwardOnboardingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  carrierNotes?: string;

  @IsOptional()
  @IsBoolean()
  loopProtectionAcknowledged?: boolean;
}

export class UpdatePortOnboardingDto {
  @IsBoolean()
  checklistAcknowledged!: boolean;

  @IsOptional()
  @IsBoolean()
  documentsSubmitted?: boolean;
}

export class RequestSipOnboardingDto {
  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class RecordForwardTestDto {
  @IsIn(['passed', 'failed'])
  result!: 'passed' | 'failed';
}
