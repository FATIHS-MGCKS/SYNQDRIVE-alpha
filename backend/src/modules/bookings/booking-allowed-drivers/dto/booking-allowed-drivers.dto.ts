import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class AddBookingAllowedDriverDto {
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;
}

export class SetBookingPrimaryDriverDto {
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;
}
