import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { DataProcessingReviewDecisionOutcome, DataProcessingReviewStepType } from '@prisma/client';

export class RecordReviewDecisionDto {
  @IsEnum(DataProcessingReviewStepType)
  stepType!: DataProcessingReviewStepType;

  @IsEnum(DataProcessingReviewDecisionOutcome)
  outcome!: DataProcessingReviewDecisionOutcome;

  @IsOptional()
  @IsString()
  @MinLength(3)
  reason?: string;
}

export class ReviewRejectDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
