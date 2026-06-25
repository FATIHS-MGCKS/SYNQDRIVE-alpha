import { IsOptional, IsUUID } from 'class-validator';

export class ListCustomerVerificationQueryDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;
}
