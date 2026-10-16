import { Equals, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RetirePhysicalDeviceDto {
  @IsString()
  @MaxLength(2000)
  retireReason!: string;

  @IsBoolean()
  @Equals(true, { message: 'retirementConfirmation must be true' })
  retirementConfirmation!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}
