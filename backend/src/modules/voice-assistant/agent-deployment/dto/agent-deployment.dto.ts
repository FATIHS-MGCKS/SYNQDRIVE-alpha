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
  @IsString()
  standardAnnouncement?: string;

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

  @IsOptional()
  @IsBoolean()
  recordCallback?: boolean;

  @IsOptional()
  @IsBoolean()
  createSupportCase?: boolean;

  @IsOptional()
  @IsBoolean()
  controlledEndCall?: boolean;

  @IsOptional()
  @IsBoolean()
  avoidFalseSuccessStatus?: boolean;

  @IsOptional()
  @IsString()
  transferFailedMessage?: string;
}

export class AgentTransferTargetDto {
  @IsString()
  type!: 'PHONE' | 'STAFF_USER' | 'STAFF_GROUP' | 'STATION';

  @IsOptional()
  @IsString()
  phoneE164?: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  organizationRoleId?: string;

  @IsOptional()
  @IsString()
  stationId?: string;
}

export class AgentTransferRuleDto {
  @IsString()
  ruleId!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsString()
  condition!: string;

  @ValidateNested()
  @Type(() => AgentTransferTargetDto)
  target!: AgentTransferTargetDto;

  @IsOptional()
  @IsString()
  topicKey?: string;

  @IsOptional()
  @IsString()
  routingStationId?: string;

  @IsOptional()
  @IsBoolean()
  respectBusinessHours?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  maxWaitSeconds?: number;

  @IsOptional()
  @IsString()
  transferType?: 'conference' | 'blind';

  @IsOptional()
  @IsString()
  warmTransferMessage?: string;

  @IsOptional()
  @IsString()
  failedTransferFallbackMessage?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AgentTransferConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentTransferRuleDto)
  rules!: AgentTransferRuleDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTransferHops?: number;

  @IsOptional()
  @IsBoolean()
  loopProtectionEnabled?: boolean;
}

export class AgentPrivacyRetentionDto {
  @IsOptional()
  @IsBoolean()
  recordAudio?: boolean;

  @IsOptional()
  @IsBoolean()
  storeTranscripts?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionAudioDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionTranscriptDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionSummaryDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionProviderPayloadDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @IsOptional()
  @IsBoolean()
  redactPii?: boolean;

  @IsOptional()
  @IsBoolean()
  redactPiiBeforeLogs?: boolean;

  @IsOptional()
  @IsString()
  consentNoticeText?: string;

  @IsOptional()
  @IsBoolean()
  masterAdminContentAccess?: boolean;
}

export class AgentPostCallConfigDto {
  @IsOptional()
  @IsBoolean()
  enableTranscript?: boolean;

  @IsOptional()
  @IsBoolean()
  enableSummary?: boolean;

  @IsOptional()
  @IsBoolean()
  enableOutcome?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAnalysis?: boolean;

  @IsOptional()
  @IsBoolean()
  sendAudio?: boolean;

  @IsOptional()
  @IsBoolean()
  signatureRequired?: boolean;
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
  @Type(() => AgentTransferConfigDto)
  transfer?: AgentTransferConfigDto;

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
  @ValidateNested()
  @Type(() => AgentPostCallConfigDto)
  postCall?: AgentPostCallConfigDto;

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
