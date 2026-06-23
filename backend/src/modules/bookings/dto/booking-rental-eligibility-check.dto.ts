import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class BookingRentalEligibilityCheckDto {
  @IsUUID('4')
  vehicleId!: string;

  @IsUUID('4')
  customerId!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(['card', 'cash', 'invoice'])
  paymentMethod?: 'card' | 'cash' | 'invoice';

  @IsOptional()
  @IsBoolean()
  foreignTravelRequested?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  additionalDriverCount?: number;

  @IsOptional()
  @IsBoolean()
  depositReceived?: boolean;
}

export class BookingRentalEligibilityBookingQueryDto {
  @IsOptional()
  @IsEnum(['card', 'cash', 'invoice'])
  paymentMethod?: 'card' | 'cash' | 'invoice';

  @IsOptional()
  @IsBoolean()
  foreignTravelRequested?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  additionalDriverCount?: number;

  @IsOptional()
  @IsBoolean()
  depositReceived?: boolean;
}
