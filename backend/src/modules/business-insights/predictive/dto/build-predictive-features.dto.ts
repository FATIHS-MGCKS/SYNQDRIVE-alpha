import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class BuildPredictiveFeaturesDto {
  @ApiPropertyOptional({
    description: 'Explicit observation dates (YYYY-MM-DD) in org timezone',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(90)
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  observationDates?: string[];

  @ApiPropertyOptional({
    description: 'Rolling lookback days when observationDates omitted',
    default: 7,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  lookbackDays?: number;

  @ApiPropertyOptional({ description: 'IANA timezone override' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Build trigger label' })
  @IsOptional()
  @IsString()
  trigger?: string;
}
