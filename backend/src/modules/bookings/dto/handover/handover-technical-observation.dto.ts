import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HANDOVER_TECHNICAL_OBSERVATION_DESCRIPTION_MAX } from '../../handover-error.codes';

export class HandoverTechnicalObservationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(HANDOVER_TECHNICAL_OBSERVATION_DESCRIPTION_MAX)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  affectedArea?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  severity?: string;

  @IsOptional()
  @IsBoolean()
  blocksRental?: boolean;
}
