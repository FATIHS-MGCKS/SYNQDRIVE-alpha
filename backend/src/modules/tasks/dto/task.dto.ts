import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TaskPriority, TaskSource, TaskStatus, TaskType } from '@prisma/client';
import { TASK_OPERATOR_BUCKETS } from '../task-bucket.util';

/** Query/body strings like `vehicleId=` normalize to undefined so filters do not match empty ids. */
export function trimEmptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  return value;
}

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

  /** When true, item is marked required for future completion policy (V2). Default false. */
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
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
  @IsISO8601()
  activatesAt?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  bookingId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  customerId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vendorId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  alertId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  documentId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  serviceCaseId?: string;

  /** Operational station reference — persisted in task metadata. */
  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedDurationMinutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];

  /** When true, task blocks vehicle rental until resolved (V4.9.17). */
  @IsOptional()
  @IsBoolean()
  blocksVehicleAvailability?: boolean;

  @IsOptional()
  metadata?: Record<string, unknown>;

  /** Free-form source label stored on OrgTask.source (e.g. HEALTH_UI). */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceKey?: string;
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

  /** null clears the assignment. */
  @IsOptional()
  @IsString()
  assignedUserId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualCostCents?: number;

  @IsOptional()
  @IsBoolean()
  blocksVehicleAvailability?: boolean;
}

export class AssignTaskDto {
  /** Omit or null to clear the assignment. */
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
  @IsString()
  @MaxLength(120)
  resolutionCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  actualCostCents?: number;

  /** Manager override: complete despite open required checklist items. */
  @IsOptional()
  @IsBoolean()
  overrideIncompleteChecklist?: boolean;

  /** Mandatory when {@link overrideIncompleteChecklist} is true and required items are open. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  overrideReason?: string;
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

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
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
  @Transform(trimEmptyToUndefined)
  @IsString()
  assignedUserId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  bookingId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  customerId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  vendorId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  alertId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  documentId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  serviceCaseId?: string;

  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  invoiceId?: string;

  /** Operational station reference stored in task metadata.stationId. */
  @IsOptional()
  @Transform(trimEmptyToUndefined)
  @IsString()
  stationId?: string;

  @IsOptional()
  @IsISO8601()
  activatesFrom?: string;

  @IsOptional()
  @IsISO8601()
  activatesTo?: string;

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
  @Transform(trimEmptyToUndefined)
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Operator bucket filter (server-side canonical semantics). */
  @IsOptional()
  @IsIn([...TASK_OPERATOR_BUCKETS])
  bucket?: (typeof TASK_OPERATOR_BUCKETS)[number];

  /** When filtering `bucket=COMPLETED`, include CANCELLED tasks (default true). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeCancelled?: boolean;
}

export const BULK_TASK_ACTION_TYPES = [
  'assign',
  'set_priority',
  'shift_due_date',
  'set_waiting',
  'cancel',
] as const;

export type BulkTaskActionType = (typeof BULK_TASK_ACTION_TYPES)[number];

export class BulkTaskActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  taskIds!: string[];

  @IsIn([...BULK_TASK_ACTION_TYPES])
  action!: BulkTaskActionType;

  /** Used with action=assign — omit or null to clear assignment. */
  @IsOptional()
  @IsString()
  assignedUserId?: string | null;

  /** Used with action=set_priority. */
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /** Used with action=shift_due_date — sets an absolute due date. */
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  /** Used with action=shift_due_date — shifts existing due date by N days. */
  @IsOptional()
  @IsInt()
  dueDateShiftDays?: number;
}
