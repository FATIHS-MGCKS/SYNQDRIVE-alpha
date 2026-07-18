import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class HomeAssignmentPreviewProposalDto {
  @IsUUID()
  vehicleId!: string;

  @IsOptional()
  @IsUUID()
  desiredHomeStationId!: string | null;
}

export class HomeAssignmentPreviewDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => HomeAssignmentPreviewProposalDto)
  proposals!: HomeAssignmentPreviewProposalDto[];
}
