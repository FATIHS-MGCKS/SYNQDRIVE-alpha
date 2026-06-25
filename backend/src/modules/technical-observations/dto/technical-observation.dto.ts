import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const SOURCES = [
  'manual',
  'operator_return',
  'operator_handover',
  'customer_report',
  'staff_inspection',
  'ai_upload',
  'system_import',
  'field_agent',
] as const;
const CATEGORIES = [
  'exterior',
  'interior',
  'lights',
  'wipers_windows',
  'wheels_tires',
  'electronics_controls',
  'noise_vibration',
  'driving_behavior',
  'comfort',
  'other',
] as const;
const AREAS = [
  'front',
  'rear',
  'left',
  'right',
  'interior',
  'dashboard',
  'lights',
  'wheels',
  'tires',
  'engine_bay',
  'trunk',
  'unknown',
] as const;
const STATUSES = ['new', 'active', 'in_review', 'converted', 'resolved', 'dismissed'] as const;

export class ListTechnicalObservationsQueryDto {
  @IsOptional()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsIn([...CATEGORIES])
  category?: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsIn([...SEVERITIES])
  severity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @IsIn([...SOURCES])
  source?: (typeof SOURCES)[number];

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsIn(['active', 'history', 'all'])
  scope?: 'active' | 'history' | 'all';
}

export class CreateTechnicalObservationDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn([...SEVERITIES])
  severity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @IsIn([...SOURCES])
  source?: (typeof SOURCES)[number];

  @IsOptional()
  @IsIn([...CATEGORIES])
  category?: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsIn([...AREAS])
  affectedArea?: (typeof AREAS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @IsBoolean()
  blocksRental?: boolean;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  driverId?: string;

  @IsOptional()
  @IsUUID()
  handoverProtocolId?: string;

  @IsOptional()
  @IsUUID()
  stationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  locationContext?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  createdByWorkerId?: string;
}

export class UpdateTechnicalObservationDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn([...CATEGORIES])
  category?: (typeof CATEGORIES)[number];

  @IsOptional()
  @IsIn([...AREAS])
  affectedArea?: (typeof AREAS)[number];

  @IsOptional()
  @IsIn([...SEVERITIES])
  severity?: (typeof SEVERITIES)[number];

  @IsOptional()
  @IsIn([...STATUSES])
  status?: (typeof STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  blocksRental?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  region?: string;
}

export class ConvertObservationToTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  blocksVehicleAvailability?: boolean;
}

export class LinkObservationDamageDto {
  @IsOptional()
  @IsUUID()
  damageId?: string;

  @IsOptional()
  @IsBoolean()
  createDamage?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  damageDescription?: string;
}

export class LinkObservationServiceDto {
  @IsOptional()
  @IsUUID()
  serviceEventId?: string;

  @IsOptional()
  @IsUUID()
  serviceTaskId?: string;

  @IsOptional()
  @IsBoolean()
  createServiceCase?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceCaseTitle?: string;
}
