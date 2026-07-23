import { IsUUID } from 'class-validator';
import { BookingUpdateConcurrencyDto } from './booking-update-concurrency.dto';

export class UpdateBookingCustomerDto extends BookingUpdateConcurrencyDto {
  @IsUUID('4')
  customerId!: string;
}
