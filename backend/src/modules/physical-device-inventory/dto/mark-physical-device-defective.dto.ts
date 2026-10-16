import { Equals, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkPhysicalDeviceDefectiveDto {
  @IsString()
  @MaxLength(2000)
  defectDescription!: string;

  @IsBoolean()
  @Equals(true, { message: 'physicalInspectionConfirmed must be true' })
  physicalInspectionConfirmed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
