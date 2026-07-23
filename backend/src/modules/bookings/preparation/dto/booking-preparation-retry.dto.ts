import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  BOOKING_PREPARATION_ARTIFACT_TYPES,
  type BookingPreparationArtifactType,
} from '../booking-preparation.constants';

export class BookingPreparationRetryDto {
  @IsIn(Object.values(BOOKING_PREPARATION_ARTIFACT_TYPES))
  artifactType!: BookingPreparationArtifactType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}
