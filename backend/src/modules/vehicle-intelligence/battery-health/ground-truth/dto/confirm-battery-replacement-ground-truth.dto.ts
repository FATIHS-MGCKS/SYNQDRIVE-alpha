import { BatteryEvidenceScope } from '@prisma/client';
import { IsEnum, IsUUID } from 'class-validator';

export class ConfirmBatteryReplacementGroundTruthDto {
  @IsUUID()
  serviceEventId!: string;

  @IsEnum(BatteryEvidenceScope)
  batteryScope!: BatteryEvidenceScope;
}
