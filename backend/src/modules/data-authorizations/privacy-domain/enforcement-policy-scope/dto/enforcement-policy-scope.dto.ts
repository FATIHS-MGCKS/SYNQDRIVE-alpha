import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class ReplaceEnforcementPolicyScopesDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  vehicleIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  customerIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  bookingIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  stationIds?: string[];
}

export interface EnforcementPolicyScopeSets {
  vehicleIds: string[];
  customerIds: string[];
  bookingIds: string[];
  stationIds: string[];
}
