import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { StationSetVehiclesListCompleteness } from '@shared/stations/station-set-vehicles.policy';

export class SetStationVehiclesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds!: string[];

  /**
   * @deprecated Declaring PARTIAL is always rejected. COMPLETE is required when
   * the payload represents the full station home fleet.
   */
  @IsOptional()
  @IsIn([StationSetVehiclesListCompleteness.COMPLETE, StationSetVehiclesListCompleteness.PARTIAL])
  listCompleteness?: StationSetVehiclesListCompleteness;
}
