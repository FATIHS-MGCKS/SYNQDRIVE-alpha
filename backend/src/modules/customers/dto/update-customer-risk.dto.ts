import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { CustomerRiskLevel } from '@prisma/client';

export class UpdateCustomerRiskDto {
  @IsEnum(CustomerRiskLevel)
  riskLevel!: CustomerRiskLevel;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  riskReason?: string;
}
