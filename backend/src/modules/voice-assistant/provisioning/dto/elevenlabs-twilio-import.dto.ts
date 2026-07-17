import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ElevenLabsTwilioImportReadinessDto {
  @IsOptional()
  @IsString()
  deploymentId?: string;
}

export class ElevenLabsTwilioImportAndAssignDto {
  @IsOptional()
  @IsString()
  deploymentId?: string;

  @IsBoolean()
  confirm!: boolean;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ElevenLabsTwilioDeactivateDto {
  @IsBoolean()
  confirm!: boolean;
}
