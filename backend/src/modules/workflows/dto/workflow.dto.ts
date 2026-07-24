import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { WORKFLOW_CATEGORIES } from '../workflow.constants';

export class WorkflowTriggerDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class WorkflowConditionDto {
  @IsOptional()
  @IsString()
  field?: string;

  @IsOptional()
  @IsString()
  path?: string;

  @IsString()
  @IsNotEmpty()
  operator!: string;

  @IsOptional()
  value?: unknown;
}

export class WorkflowActionDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;
}

export class WorkflowScopeDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  stationIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  vehicleIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bookingIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];
}

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsIn([...WORKFLOW_CATEGORIES])
  category!: string;

  @ValidateNested()
  @Type(() => WorkflowTriggerDto)
  trigger!: WorkflowTriggerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionDto)
  conditions?: WorkflowConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions!: WorkflowActionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowScopeDto)
  scope?: WorkflowScopeDto;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ACTIVE', 'DISABLED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'DISABLED';
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn([...WORKFLOW_CATEGORIES])
  category?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowTriggerDto)
  trigger?: WorkflowTriggerDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionDto)
  conditions?: WorkflowConditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions?: WorkflowActionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowScopeDto)
  scope?: WorkflowScopeDto;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ACTIVE', 'DISABLED', 'INVALID'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ACTIVE' | 'DISABLED' | 'INVALID';
}

export class TestWorkflowDto {
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;
}

export class ArchiveWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class RejectWorkflowActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
