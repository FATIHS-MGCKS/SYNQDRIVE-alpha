import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CustomerStatus } from '@prisma/client';

export class UpdateCustomerStatusDto {
  @IsEnum(CustomerStatus)
  status!: CustomerStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
