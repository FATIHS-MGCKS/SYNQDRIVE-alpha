import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WORKFLOW_CONDITION_LIMITS } from '../conditions/workflow-condition.config';
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

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class WorkflowConditionGroupDto {
  @IsIn(['ALL', 'ANY', 'NOT', 'AND', 'OR'])
  logic!: 'ALL' | 'ANY' | 'NOT' | 'AND' | 'OR';

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKFLOW_CONDITION_LIMITS.maxClauseCount)
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionDto)
  conditions?: WorkflowConditionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WORKFLOW_CONDITION_LIMITS.maxNodeCount)
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionGroupDto)
  groups?: WorkflowConditionGroupDto[];
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

  @IsOptional()
  @IsString()
  errorStrategy?: string;

  @IsOptional()
  @IsString()
  fallbackActionKey?: string;

  @IsOptional()
  @IsString()
  compensateActionKey?: string;

  @IsOptional()
  @IsBoolean()
  compensatable?: boolean;

  @IsOptional()
  @IsString()
  actionKey?: string;
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

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowConditionGroupDto)
  conditionTree?: WorkflowConditionGroupDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionGroupDto)
  conditionGroups?: WorkflowConditionGroupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions!: WorkflowActionDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => WorkflowScopeDto)
  scope?: WorkflowScopeDto;

  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'DISABLED'])
  status?: 'DRAFT' | 'ACTIVE' | 'DISABLED';
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
  @ValidateNested()
  @Type(() => WorkflowConditionGroupDto)
  conditionTree?: WorkflowConditionGroupDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionGroupDto)
  conditionGroups?: WorkflowConditionGroupDto[];

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
  @IsIn(['DRAFT', 'ACTIVE', 'DISABLED', 'INVALID'])
  status?: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'INVALID';
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

export class RejectWorkflowActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
