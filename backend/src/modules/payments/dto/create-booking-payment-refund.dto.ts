import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBookingPaymentRefundDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}
