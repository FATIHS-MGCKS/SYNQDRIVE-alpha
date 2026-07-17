import { IsObject } from 'class-validator';

/** Persist human-reviewed field values without applying — re-runs plausibility. */
export class SaveReviewExtractionDto {
  @IsObject()
  confirmedData!: Record<string, unknown>;
}
