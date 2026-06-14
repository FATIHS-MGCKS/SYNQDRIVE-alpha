import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Query for Mapbox POI vendor search (suggest step). */
export class VendorMapboxSearchQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(256)
  query!: string;

  /** ISO 3166-1 alpha-2 country filter (e.g. `de`, `at`, `ch`). */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]{2}$/)
  country?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}

/** Query for the Mapbox retrieve step (prefill a selected suggestion). */
export class VendorMapboxRetrieveQueryDto {
  /** Session token returned by the suggest call (groups suggest+retrieve). */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  sessionToken!: string;
}
