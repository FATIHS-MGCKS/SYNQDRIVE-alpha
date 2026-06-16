import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ALL_DATA_AUTHORIZATION_CATEGORIES,
  DATA_AUTHORIZATION_ACCESS_PATTERNS,
  DATA_AUTHORIZATION_PROCESSOR_TYPES,
  DATA_AUTHORIZATION_PURPOSES,
  DATA_AUTHORIZATION_SCOPES,
  DATA_AUTHORIZATION_SOURCE_TYPES,
} from '../data-authorization.constants';

export class UpdateDataAuthorizationDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  requestingEntity?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  moduleOrigin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  purpose?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(DATA_AUTHORIZATION_PURPOSES, { each: true })
  purposes?: string[];

  @IsOptional()
  @IsIn(DATA_AUTHORIZATION_SOURCE_TYPES)
  sourceType?: string;

  @IsOptional()
  @IsIn(DATA_AUTHORIZATION_PROCESSOR_TYPES)
  processorType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  processorName?: string;

  @IsOptional()
  @IsIn(DATA_AUTHORIZATION_SCOPES)
  scope?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ALL_DATA_AUTHORIZATION_CATEGORIES, { each: true })
  dataCategories?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  destination?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  vehicleIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  customerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  bookingIds?: string[];

  @IsOptional()
  @IsIn(DATA_AUTHORIZATION_ACCESS_PATTERNS)
  accessPattern?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
