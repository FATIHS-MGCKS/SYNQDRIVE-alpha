import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  StationCalendarExceptionType,
  StationCalendarRecurrenceKind,
} from '@prisma/client';

export class StationCalendarExceptionSlotDto {
  @IsString()
  @IsNotEmpty()
  open!: string;

  @IsString()
  @IsNotEmpty()
  close!: string;
}

export class CreateStationCalendarExceptionDto {
  @IsEnum(StationCalendarExceptionType)
  type!: StationCalendarExceptionType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(StationCalendarRecurrenceKind)
  recurrenceKind?: StationCalendarRecurrenceKind;

  @IsOptional()
  @IsString()
  calendarDate?: string;

  @IsOptional()
  @IsString()
  monthDay?: string;

  @IsOptional()
  @IsBoolean()
  closedAllDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StationCalendarExceptionSlotDto)
  slots?: StationCalendarExceptionSlotDto[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  regionCode?: string;
}

export class UpdateStationCalendarExceptionDto {
  @IsOptional()
  @IsEnum(StationCalendarExceptionType)
  type?: StationCalendarExceptionType;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(StationCalendarRecurrenceKind)
  recurrenceKind?: StationCalendarRecurrenceKind;

  @IsOptional()
  @IsString()
  calendarDate?: string | null;

  @IsOptional()
  @IsString()
  monthDay?: string | null;

  @IsOptional()
  @IsBoolean()
  closedAllDay?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StationCalendarExceptionSlotDto)
  slots?: StationCalendarExceptionSlotDto[] | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  regionCode?: string | null;
}
