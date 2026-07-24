import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PolicyLifecycleReasonDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class PolicyLifecycleRejectDto extends PolicyLifecycleReasonDto {}

export class PolicyLifecycleScheduleDto {
  @IsDateString()
  validFrom!: string;
}

export class PolicyLifecycleExtendDto {
  @IsDateString()
  validUntil!: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
