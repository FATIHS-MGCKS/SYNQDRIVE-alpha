import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ManualPickupCheckDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  bookingId!: string;

  @IsBoolean()
  idDocumentSeen!: boolean;

  @IsBoolean()
  idNameMatchesBooking!: boolean;

  @IsBoolean()
  idDateOfBirthChecked!: boolean;

  @IsBoolean()
  minimumAgePassed!: boolean;

  @IsBoolean()
  drivingLicenseSeen!: boolean;

  @IsBoolean()
  licenseNameMatchesBooking!: boolean;

  @IsBoolean()
  licenseClassValid!: boolean;

  @IsBoolean()
  licenseNotExpired!: boolean;

  @IsOptional()
  @IsBoolean()
  minimumLicenseDurationPassed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
