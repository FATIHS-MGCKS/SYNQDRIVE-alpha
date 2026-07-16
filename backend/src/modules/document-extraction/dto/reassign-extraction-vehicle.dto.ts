import { IsString, IsUUID } from 'class-validator';

export class ReassignExtractionVehicleDto {
  @IsUUID()
  vehicleId!: string;
}
