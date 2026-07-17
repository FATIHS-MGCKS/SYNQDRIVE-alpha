import { BadRequestException } from '@nestjs/common';
import {
  VOICE_PERMISSION_MODES,
  VOICE_TOOL_CAPABILITIES,
  type VoiceToolCapabilityKey,
} from '../voice-assistant-permissions';
import type { CanonicalAgentConfig, CanonicalAgentConfigPatch } from './agent-config.types';

const MAX_PROMPT_LENGTH = 50_000;
const MAX_NAME_LENGTH = 120;

export type AgentConfigValidationOptions = {
  forDeploy?: boolean;
};

export function validateCanonicalAgentConfig(
  config: CanonicalAgentConfig,
  options: AgentConfigValidationOptions = {},
): void {
  const errors: string[] = [];

  if (!config.assistantName?.trim()) {
    errors.push('Assistant name is required.');
  } else if (config.assistantName.trim().length > MAX_NAME_LENGTH) {
    errors.push(`Assistant name must be at most ${MAX_NAME_LENGTH} characters.`);
  }

  if (!config.language?.trim()) {
    errors.push('Language is required.');
  }

  if (options.forDeploy && !config.systemPrompt?.trim()) {
    errors.push('System prompt is required before deployment.');
  }

  if (config.systemPrompt && config.systemPrompt.length > MAX_PROMPT_LENGTH) {
    errors.push(`System prompt must be at most ${MAX_PROMPT_LENGTH} characters.`);
  }

  if (options.forDeploy && !config.voiceId?.trim()) {
    errors.push('Voice selection is required before deployment.');
  }

  if (!config.greeting?.trim()) {
    errors.push('Greeting is required.');
  }

  const allowedToolKeys = new Set(VOICE_TOOL_CAPABILITIES.map((cap) => cap.key));
  for (const tool of config.mcpToolRefs) {
    if (!allowedToolKeys.has(tool.capabilityKey as VoiceToolCapabilityKey)) {
      errors.push(`Unknown MCP tool capability: ${tool.capabilityKey}`);
    }
    if (!VOICE_PERMISSION_MODES.includes(tool.mode)) {
      errors.push(`Invalid permission mode for ${tool.capabilityKey}.`);
    }
  }

  validateRetentionDays('audio', config.privacyRetention.retentionAudioDays, errors);
  validateRetentionDays('transcript', config.privacyRetention.retentionTranscriptDays, errors);
  validateRetentionDays('summary', config.privacyRetention.retentionSummaryDays, errors);
  validateRetentionDays(
    'provider payload',
    config.privacyRetention.retentionProviderPayloadDays,
    errors,
  );
  validateRetentionDays('legacy transcript', config.privacyRetention.retentionDays, errors);

  if (config.privacyRetention.recordAudio && !config.privacyRetention.consentNoticeText?.trim()) {
    errors.push('Audio recording requires a configured consent or privacy notice text.');
  }

  if (config.postCall.sendAudio && !config.privacyRetention.recordAudio) {
    errors.push('Post-call audio delivery requires explicit audio recording consent in privacy settings.');
  }

  for (const rule of config.transfer?.rules ?? []) {
    if (!rule.ruleId?.trim()) {
      errors.push('Each transfer rule requires a rule id.');
    }
    if (!rule.condition?.trim()) {
      errors.push(`Transfer rule ${rule.ruleId || '(unknown)'} requires a condition.`);
    }
    if (rule.transferType && !['conference', 'blind'].includes(rule.transferType)) {
      errors.push(`Transfer rule ${rule.ruleId} has unsupported transfer type.`);
    }
  }

  if (errors.length > 0) {
    throw new BadRequestException({
      message: 'Voice agent configuration validation failed.',
      errors,
    });
  }
}

function validateRetentionDays(
  label: string,
  value: number | null | undefined,
  errors: string[],
): void {
  if (value == null) return;
  if (value < 1 || value > 3650) {
    errors.push(`${label} retention days must be between 1 and 3650.`);
  }
}

export function rejectProviderPayloadKeys(patch: CanonicalAgentConfigPatch): void {
  const forbidden = [
    'agent_id',
    'conversation_config',
    'platform_settings',
    'providerPayload',
    'elevenLabs',
    'elevenlabs',
    'mcp_server_ids',
    'tools',
    'webhookUrl',
    'webhookSecret',
    'webhook_secret',
  ];
  for (const key of Object.keys(patch as Record<string, unknown>)) {
    if (forbidden.includes(key)) {
      throw new BadRequestException('Provider payloads cannot be saved from the tenant API.');
    }
  }

  if (patch.postCall && ('webhookUrl' in patch.postCall || 'webhookSecret' in patch.postCall)) {
    throw new BadRequestException('Post-call webhook URLs must be resolved server-side.');
  }
}
