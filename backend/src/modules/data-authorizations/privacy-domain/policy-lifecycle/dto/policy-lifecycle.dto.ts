import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

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
