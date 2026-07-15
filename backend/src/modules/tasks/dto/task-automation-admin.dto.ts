import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

const ASSIGNMENT_STRATEGIES = ['UNASSIGNED', 'STATION_FROM_BOOKING', 'INHERIT_FROM_CONTEXT'] as const;

export class TaskAutomationChecklistAdditionalItemDto {
  @IsString()
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;
}

export class TaskAutomationChecklistOverrideDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenOptionalTitles?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskAutomationChecklistAdditionalItemDto)
  additionalItems?: TaskAutomationChecklistAdditionalItemDto[];
}

export class UpsertTaskAutomationRuleOverrideDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean | null;

  @IsOptional()
  @IsInt()
  activationOffsetMinutes?: number | null;

  @IsOptional()
  @IsInt()
  dueOffsetMinutes?: number | null;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority | null;

  @IsOptional()
  @IsIn(ASSIGNMENT_STRATEGIES)
  assignmentStrategy?: string | null;

  @IsOptional()
  @IsString()
  assignedUserId?: string | null;

  @IsOptional()
  @IsString()
  assignedRoleKey?: string | null;

  @IsOptional()
  @IsString()
  stationScope?: string | null;

  @IsOptional()
  @IsObject()
  escalationConfig?: Record<string, unknown> | null;

  @IsOptional()
  @IsObject()
  notificationConfig?: Record<string, unknown> | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => TaskAutomationChecklistOverrideDto)
  checklistOverrides?: TaskAutomationChecklistOverrideDto | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class ResetTaskAutomationRuleOverrideDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

export class SimulateTaskAutomationRuleDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertTaskAutomationRuleOverrideDto)
  proposedConfig?: UpsertTaskAutomationRuleOverrideDto | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  periodDays?: number;
}
