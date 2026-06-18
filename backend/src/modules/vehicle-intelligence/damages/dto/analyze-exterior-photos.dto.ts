import { DamageLocationView } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const VIEWS = Object.values(DamageLocationView).filter((v) => v !== 'UNKNOWN');

export class ExteriorPhotoInputDto {
  @IsEnum(DamageLocationView)
  view!: DamageLocationView;

  /** Base64 data URI — same whitelist as damage/exterior image uploads */
  @IsString()
  imageData!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;
}

export class AnalyzeExteriorPhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExteriorPhotoInputDto)
  images!: ExteriorPhotoInputDto[];
}

export const ANALYZABLE_EXTERIOR_VIEWS = VIEWS;
