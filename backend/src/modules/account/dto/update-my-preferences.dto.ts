import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const SUPPORTED_LANGUAGES = ['de', 'en'] as const;
const SUPPORTED_DATE_FORMATS = ['DD.MM.YYYY', 'YYYY-MM-DD'] as const;
const SUPPORTED_LANDING_PAGES = ['dashboard', 'bookings', 'fleet', 'customers', 'tasks'] as const;

export class UpdateMyPreferencesDto {
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: (typeof SUPPORTED_LANGUAGES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsIn(SUPPORTED_DATE_FORMATS)
  dateFormat?: (typeof SUPPORTED_DATE_FORMATS)[number];

  @IsOptional()
  @IsString()
  defaultStationId?: string | null;

  @IsOptional()
  @IsIn(SUPPORTED_LANDING_PAGES)
  defaultLandingPage?: (typeof SUPPORTED_LANDING_PAGES)[number] | null;
}
