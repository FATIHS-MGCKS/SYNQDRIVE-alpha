import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class AgentBusinessHoursDayDto {
  @IsString()
  day!: string;

  @IsOptional()
  @IsString()
  open?: string;

  @IsOptional()
  @IsString()
  close?: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class AgentBusinessHoursDto {
  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  end?: string;

  @IsOptional()
  @IsString()
  afterHoursMessage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentBusinessHoursDayDto)
  schedule?: AgentBusinessHoursDayDto[];
}

export class AgentDynamicVariableDto {
  @IsString()
  @MaxLength(80)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  defaultValue?: string;
}

export class AgentMcpToolRefDto {
  @IsString()
  capabilityKey!: string;

  @IsString()
  mode!: string;
}

export class AgentKnowledgeRefDto {
  @IsString()
  refId!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  source!: 'snippet' | 'document';
}

export class AgentFallbackConfigDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsBoolean()
  escalateOnRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  escalateOnLowConfidence?: boolean;

  @IsOptional()
  @IsBoolean()
  escalateOnSensitive?: boolean;

  @IsOptional()
  @IsString()
  escalationDepartment?: string;
}

export class AgentPrivacyRetentionDto {
  @IsOptional()
  @IsBoolean()
  storeTranscripts?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @IsOptional()
  @IsBoolean()
  redactPii?: boolean;
}

export class SaveAgentDeploymentDraftDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assistantName?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  companyContext?: string;

  @IsOptional()
  @IsString()
  businessRules?: string;

  @IsOptional()
  @IsString()
  forbiddenActions?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  voiceId?: string;

  @IsOptional()
  @IsString()
  voiceName?: string;

  @IsOptional()
  @IsString()
  greeting?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentDynamicVariableDto)
  dynamicVariables?: AgentDynamicVariableDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentBusinessHoursDto)
  businessHours?: AgentBusinessHoursDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentFallbackConfigDto)
  fallback?: AgentFallbackConfigDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentMcpToolRefDto)
  mcpToolRefs?: AgentMcpToolRefDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentKnowledgeRefDto)
  knowledgeRefs?: AgentKnowledgeRefDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentPrivacyRetentionDto)
  privacyRetention?: AgentPrivacyRetentionDto;

  @IsOptional()
  @IsString()
  expectedUpdatedAt?: string;
}

export class DeployAgentDeploymentDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class RollbackAgentDeploymentDto {
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
