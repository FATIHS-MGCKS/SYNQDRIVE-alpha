import { IsArray, IsIn, IsString, IsUUID } from 'class-validator';
import { VehicleStationTransferStatus } from '@prisma/client';

export class ChangeHomeStationDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  toStationId!: string;
}

export class HomeFleetPreviewDto {
  @IsUUID()
  stationId!: string;

  @IsArray()
  @IsString({ each: true })
  vehicleIds!: string[];
}

export class CreateStationTransferDto {
  @IsUUID()
  vehicleId!: string;

  @IsUUID()
  fromStationId!: string;

  @IsUUID()
  toStationId!: string;
}

export class UpdateStationTransferStatusDto {
  @IsIn(['IN_TRANSIT', 'ARRIVED', 'CANCELLED'])
  status!: VehicleStationTransferStatus;
}
