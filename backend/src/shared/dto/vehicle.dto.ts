import {
  IsString, IsOptional, IsEnum, IsInt, Min, Max,
  MaxLength, MinLength, IsPositive, IsNumber, IsUUID, IsBoolean,
} from 'class-validator';

export enum FuelTypeDto {
  GASOLINE = 'GASOLINE',
  DIESEL = 'DIESEL',
  ELECTRIC = 'ELECTRIC',
  HYBRID = 'HYBRID',
  PLUGIN_HYBRID = 'PLUGIN_HYBRID',
  OTHER = 'OTHER',
}

export enum VehicleTypeDto {
  SEDAN = 'SEDAN',
  SUV = 'SUV',
  HATCHBACK = 'HATCHBACK',
  WAGON = 'WAGON',
  COUPE = 'COUPE',
  CONVERTIBLE = 'CONVERTIBLE',
  VAN = 'VAN',
  TRUCK = 'TRUCK',
  MINIVAN = 'MINIVAN',
  OTHER = 'OTHER',
}

export class CreateVehicleDto {
  @IsString()
  @MaxLength(20)
  vin: string;

  @IsString()
  @MaxLength(60)
  make: string;

  @IsString()
  @MaxLength(60)
  model: string;

  @IsInt()
  @Min(1900)
  @Max(new Date().getFullYear() + 2)
  year: number;

  @IsEnum(FuelTypeDto)
  fuelType: FuelTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string;

  @IsOptional()
  @IsEnum(VehicleTypeDto)
  vehicleType?: VehicleTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vehicleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  mileageKm?: number;
}

export class UpdateVehicleStatusDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  cleaningStatus?: string;

  @IsOptional()
  @IsString()
  healthStatus?: string;
}

export class RegisterFromDimoDto {
  @IsString()
  @MinLength(1)
  dimoVehicleId: string;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  extraData?: Record<string, unknown>;

  @IsOptional()
  manualSpecs?: Record<string, unknown>;
}
