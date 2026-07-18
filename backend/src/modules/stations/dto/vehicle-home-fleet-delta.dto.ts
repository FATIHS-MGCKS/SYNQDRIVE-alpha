import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class VehicleHomeFleetDeltaBaseDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  vehicleIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class MoveVehiclesToHomeStationDto extends VehicleHomeFleetDeltaBaseDto {
  @IsUUID()
  targetStationId!: string;
}
