import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class StationMapboxSearchQueryDto {
  @IsString()
  @MaxLength(200)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

export class StationMapboxRetrieveQueryDto {
  @IsString()
  @MaxLength(200)
  sessionToken!: string;
}
