import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CustomerVerificationCheckKind } from '@prisma/client';

export class StartDiditSessionDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsEnum(CustomerVerificationCheckKind)
  kind!: CustomerVerificationCheckKind;
}
