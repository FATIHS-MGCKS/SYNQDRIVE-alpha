import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TaskPriority, TaskType } from '@prisma/client';
import { Type } from 'class-transformer';
import { trimEmptyToUndefined } from './service-case.dto.utils';

class ServiceCaseTaskChecklistItemDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

/** Create a task scoped to an existing service case (vehicle/case injected server-side). */
export class CreateServiceCaseTaskDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @IsBoolean()
  blocksVehicleAvailability?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  initialNote?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceCaseTaskChecklistItemDto)
  checklist?: ServiceCaseTaskChecklistItemDto[];
}
