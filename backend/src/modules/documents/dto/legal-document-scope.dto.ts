import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  LEGAL_BOOKING_CHANNELS,
  LEGAL_CUSTOMER_SEGMENTS,
  LEGAL_NOTICE_PURPOSES,
  LEGAL_PRODUCT_SCOPES,
  LEGAL_SCOPE_PRIORITY_MAX,
  LEGAL_SCOPE_PRIORITY_MIN,
  LEGAL_STATION_SCOPE_MODES,
} from '../legal-document-scope.constants';

export class LegalDocumentApplicationScopeDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  jurisdictionCountry?: string;

  @IsOptional()
  @IsIn(LEGAL_CUSTOMER_SEGMENTS as unknown as string[])
  customerSegment?: string;

  @IsOptional()
  @IsIn(LEGAL_BOOKING_CHANNELS as unknown as string[])
  bookingChannel?: string;

  @IsOptional()
  @IsIn(LEGAL_PRODUCT_SCOPES as unknown as string[])
  productScope?: string;

  @IsOptional()
  @IsIn(LEGAL_STATION_SCOPE_MODES as unknown as string[])
  stationScopeMode?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  stationIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(LEGAL_SCOPE_PRIORITY_MIN)
  @Max(LEGAL_SCOPE_PRIORITY_MAX)
  @Type(() => Number)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isMandatory?: boolean;

  @IsOptional()
  @IsIn(LEGAL_NOTICE_PURPOSES as unknown as string[])
  noticePurpose?: string;

  @IsOptional()
  @IsISO8601()
  validFrom?: string;

  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}

export class CreateLegalDocumentScopeDto extends LegalDocumentApplicationScopeDto {}

export class UpdateLegalDocumentScopeDto extends LegalDocumentApplicationScopeDto {
  @ValidateNested()
  @Type(() => LegalDocumentApplicationScopeDto)
  scope?: LegalDocumentApplicationScopeDto;
}
