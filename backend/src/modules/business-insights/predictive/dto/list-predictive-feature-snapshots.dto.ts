import { ApiPropertyOptional } from '@nestjs/swagger';
import { PredictiveFeatureGrain } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ListPredictiveFeatureSnapshotsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  observationDateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  observationDateTo?: string;

  @ApiPropertyOptional({ enum: PredictiveFeatureGrain })
  @IsOptional()
  @IsEnum(PredictiveFeatureGrain)
  grain?: PredictiveFeatureGrain;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
