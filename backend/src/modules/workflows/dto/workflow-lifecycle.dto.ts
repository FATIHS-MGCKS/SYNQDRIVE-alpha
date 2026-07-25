import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  WorkflowActionDto,
  WorkflowConditionDto,
  WorkflowScopeDto,
  WorkflowTriggerDto,
} from './workflow.dto';

export class CreateWorkflowDefinitionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

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
}

export class UpdateWorkflowDefinitionMetadataDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

export class UpdateWorkflowDraftDto {
  @IsInt()
  @Min(1)
  expectedLockVersion!: number;

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
  @IsString()
  @MaxLength(2000)
  changeReason?: string;
}

export class PublishWorkflowVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;
}

export class ActivateWorkflowVersionDto {
  @IsString()
  @IsNotEmpty()
  versionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;
}

export class LifecycleChangeReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;
}

export class CreateWorkflowDraftDto {
  @IsOptional()
  @IsString()
  sourceVersionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changeReason?: string;
}
