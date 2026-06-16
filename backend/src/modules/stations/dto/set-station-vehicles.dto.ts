import { IsArray, IsUUID } from 'class-validator';

export class SetStationVehiclesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds!: string[];
}
