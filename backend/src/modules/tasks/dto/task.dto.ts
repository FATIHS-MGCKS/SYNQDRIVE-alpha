import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TaskPriority, TaskSource, TaskStatus, TaskType } from '@prisma/client';

/**
 * Validation DTOs for the Task Action Layer (V4.8.3). These replace the
 * previous inline `body: {...}` literal types so the global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) enforces enums, lengths and
 * realistic numeric ranges before anything reaches TasksService. All
 * relational ids are additionally validated to belong to the org in the
 * service layer.
 */

export class ChecklistItemDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateTaskDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsEnum(TaskType)
  type!: TaskType;

  @IsOptional()
  @IsEnum(TaskSource)
  source?: TaskSource;

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
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  alertId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];
}

export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualCostCents?: number;
}

export class AssignTaskDto {
  // null clears the assignment.
  @IsOptional()
  @IsString()
  assignedUserId?: string | null;
}

export class CompleteTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolutionNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualCostCents?: number;
}

export class AddCommentDto {
  @IsString()
  @MaxLength(4000)
  body!: string;
}

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isDone?: boolean;
}

export class AddAttachmentDto {
  @IsString()
  @MaxLength(2000)
  fileUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  mimeType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  size?: number;
}

export class ListTasksQueryDto {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsEnum(TaskSource)
  source?: TaskSource;

  @IsOptional()
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  vendorId?: string;

  @IsOptional()
  @IsString()
  alertId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsISO8601()
  dueFrom?: string;

  @IsOptional()
  @IsISO8601()
  dueTo?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
