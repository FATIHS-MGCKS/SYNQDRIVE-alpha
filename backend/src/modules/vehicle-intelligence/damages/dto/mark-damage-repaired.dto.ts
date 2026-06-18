import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const COST_MAX = 100_000_000;
const NOTE_MAX = 2000;
const REPORTED_BY_MAX = 200;

export class MarkDamageRepairedDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(COST_MAX)
  repairCostCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(REPORTED_BY_MAX)
  repairedBy?: string;
}
