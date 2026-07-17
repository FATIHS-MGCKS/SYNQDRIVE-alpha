import type { VoiceAssistant } from '@prisma/client';
import { buildToolPolicyForAssistant } from '../voice-assistant-permissions';
import { buildDefaultPostCallConfig } from './agent-post-call.config';
import type {
  AgentBusinessHours,
  AgentKnowledgeRef,
  AgentMcpToolRef,
  AgentPostCallConfig,
  AgentTransferConfig,
  CanonicalAgentConfig,
  CanonicalAgentConfigPatch,
} from './agent-config.types';

function readBusinessHours(assistant: VoiceAssistant): AgentBusinessHours | null {
  const raw = assistant.businessHours;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const schedule = Array.isArray((raw as { schedule?: unknown }).schedule)
      ? ((raw as { schedule: unknown[] }).schedule as AgentBusinessHours['schedule'])
      : undefined;
    return {
      timezone: assistant.businessHoursTimezone ?? (raw as { timezone?: string }).timezone ?? null,
      start: assistant.businessHoursStart ?? (raw as { start?: string }).start ?? null,
      end: assistant.businessHoursEnd ?? (raw as { end?: string }).end ?? null,
      afterHoursMessage:
        assistant.afterHoursMessage ?? (raw as { afterHoursMessage?: string }).afterHoursMessage ?? null,
      schedule,
    };
  }

  if (
    assistant.businessHoursStart ||
    assistant.businessHoursEnd ||
    assistant.businessHoursTimezone ||
    assistant.afterHoursMessage
  ) {
    return {
      timezone: assistant.businessHoursTimezone,
      start: assistant.businessHoursStart,
      end: assistant.businessHoursEnd,
      afterHoursMessage: assistant.afterHoursMessage,
    };
  }

  return null;
}

function readKnowledgeRefs(assistant: VoiceAssistant): AgentKnowledgeRef[] {
  if (!assistant.knowledgeSnippets?.trim()) {
    return [];
  }
  return [
    {
      refId: 'primary-snippet',
      title: 'Knowledge snippets',
      source: 'snippet',
    },
  ];
}

function readMcpToolRefs(assistant: VoiceAssistant): AgentMcpToolRef[] {
  const policy = buildToolPolicyForAssistant(assistant);
  return policy.capabilities.map((cap) => ({
    capabilityKey: cap.key,
    mode: cap.mode,
  }));
}

function readTransferConfig(assistant: VoiceAssistant): AgentTransferConfig | null {
  const rules = [];
  if (assistant.escalationPhone?.trim()) {
    rules.push({
      ruleId: 'legacy-escalation-phone',
      label: 'Legacy escalation phone',
      condition: 'When escalation is required.',
      target: {
        type: 'PHONE' as const,
        phoneE164: assistant.escalationPhone,
      },
      transferType: 'conference' as const,
      respectBusinessHours: true,
      maxWaitSeconds: 60,
      enabled: true,
    });
  } else if (assistant.escalationUserId?.trim()) {
    rules.push({
      ruleId: 'legacy-escalation-user',
      label: 'Legacy escalation user',
      condition: 'When escalation is required.',
      target: {
        type: 'STAFF_USER' as const,
        userId: assistant.escalationUserId,
      },
      transferType: 'conference' as const,
      respectBusinessHours: true,
      maxWaitSeconds: 60,
      enabled: true,
    });
  }

  if (!rules.length) {
    return null;
  }

  return {
    rules,
    maxTransferHops: 2,
    loopProtectionEnabled: true,
  };
}

function defaultPrivacyRetention(): CanonicalAgentConfig['privacyRetention'] {
  return {
    recordAudio: false,
    storeTranscripts: true,
    retentionAudioDays: null,
    retentionTranscriptDays: 90,
    retentionSummaryDays: 90,
    retentionProviderPayloadDays: 30,
    retentionDays: 90,
    redactPii: true,
    redactPiiBeforeLogs: true,
    consentNoticeText: null,
    masterAdminContentAccess: false,
  };
}

export function buildCanonicalAgentConfigFromAssistant(
  assistant: VoiceAssistant,
): CanonicalAgentConfig {
  return {
    assistantName: assistant.name?.trim() || 'AI Assistant',
    systemPrompt: assistant.systemPrompt?.trim() || '',
    companyContext: assistant.companyContext,
    businessRules: assistant.businessRules,
    forbiddenActions: assistant.forbiddenActions,
    language: assistant.language?.trim() || 'en',
    voiceId: assistant.voiceId,
    voiceName: assistant.voiceName,
    greeting:
      assistant.greetingMessage?.trim() ||
      `Hello, this is ${assistant.name?.trim() || 'AI Assistant'}. How can I help you?`,
    dynamicVariables: [],
    businessHours: readBusinessHours(assistant),
    transfer: readTransferConfig(assistant),
    fallback: {
      message: assistant.fallbackMessage,
      standardAnnouncement:
        assistant.fallbackMessage ||
        'We cannot complete this request right now. We will follow up as soon as possible.',
      escalateOnRequest: assistant.escalateOnRequest,
      escalateOnLowConfidence: assistant.escalateOnLowConf,
      escalateOnSensitive: assistant.escalateOnSensitive,
      escalationDepartment: assistant.escalationDepartment,
      recordCallback: true,
      createSupportCase: true,
      controlledEndCall: true,
      avoidFalseSuccessStatus: true,
      transferFailedMessage:
        assistant.fallbackMessage ||
        'Transfer is currently unavailable. We have recorded your request.',
    },
    mcpToolRefs: readMcpToolRefs(assistant),
    knowledgeRefs: readKnowledgeRefs(assistant),
    privacyRetention: defaultPrivacyRetention(),
    postCall: buildDefaultPostCallConfig(assistant.organizationId),
  };
}

export function mergeCanonicalAgentConfig(
  base: CanonicalAgentConfig,
  patch: CanonicalAgentConfigPatch,
  organizationId: string,
): CanonicalAgentConfig {
  return {
    ...base,
    ...patch,
    dynamicVariables: patch.dynamicVariables ?? base.dynamicVariables,
    mcpToolRefs: patch.mcpToolRefs ?? base.mcpToolRefs,
    knowledgeRefs: patch.knowledgeRefs ?? base.knowledgeRefs,
    businessHours:
      patch.businessHours === undefined ? base.businessHours : patch.businessHours,
    transfer: patch.transfer === undefined ? base.transfer : patch.transfer,
    fallback: patch.fallback === undefined ? base.fallback : patch.fallback,
    privacyRetention: {
      ...base.privacyRetention,
      ...(patch.privacyRetention ?? {}),
    },
    postCall: mergePostCallConfig(base.postCall, patch.postCall, organizationId),
  };
}

function mergePostCallConfig(
  base: AgentPostCallConfig,
  patch: CanonicalAgentConfigPatch['postCall'],
  organizationId: string,
): AgentPostCallConfig {
  const defaults = buildDefaultPostCallConfig(organizationId);
  return {
    ...defaults,
    ...base,
    ...(patch ?? {}),
    version: defaults.version,
    webhookPath: defaults.webhookPath,
    signatureRequired: patch?.signatureRequired ?? base.signatureRequired ?? true,
    webhookSecretConfigured: defaults.webhookSecretConfigured,
    sendAudio: patch?.sendAudio ?? base.sendAudio ?? false,
  };
}

export function parseCanonicalAgentConfigSnapshot(
  value: unknown,
  organizationId: string,
): CanonicalAgentConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<CanonicalAgentConfig>;
  if (!row.assistantName || !row.language) {
    return null;
  }

  const privacy = {
    ...defaultPrivacyRetention(),
    ...(row.privacyRetention ?? {}),
  };

  return {
    assistantName: String(row.assistantName),
    systemPrompt: String(row.systemPrompt ?? ''),
    companyContext: row.companyContext ?? null,
    businessRules: row.businessRules ?? null,
    forbiddenActions: row.forbiddenActions ?? null,
    language: String(row.language),
    voiceId: row.voiceId ?? null,
    voiceName: row.voiceName ?? null,
    greeting: String(row.greeting ?? ''),
    dynamicVariables: Array.isArray(row.dynamicVariables) ? row.dynamicVariables : [],
    businessHours: row.businessHours ?? null,
    transfer: row.transfer ?? null,
    fallback: row.fallback ?? null,
    mcpToolRefs: Array.isArray(row.mcpToolRefs) ? row.mcpToolRefs : [],
    knowledgeRefs: Array.isArray(row.knowledgeRefs) ? row.knowledgeRefs : [],
    privacyRetention: privacy,
    postCall: {
      ...buildDefaultPostCallConfig(organizationId),
      ...(row.postCall ?? {}),
      webhookPath: buildDefaultPostCallConfig(organizationId).webhookPath,
      webhookSecretConfigured: buildDefaultPostCallConfig(organizationId).webhookSecretConfigured,
    },
  };
}

export function buildProviderSystemPrompt(config: CanonicalAgentConfig): string {
  const parts: string[] = [];
  if (config.systemPrompt) parts.push(config.systemPrompt);
  if (config.companyContext) parts.push(`\n\nCompany Context:\n${config.companyContext}`);
  if (config.businessRules) parts.push(`\n\nBusiness Rules:\n${config.businessRules}`);
  if (config.forbiddenActions) parts.push(`\n\nForbidden Actions:\n${config.forbiddenActions}`);
  if (config.knowledgeRefs.length > 0) {
    parts.push(`\n\nKnowledge references configured: ${config.knowledgeRefs.length}`);
  }

  const enabledTools = config.mcpToolRefs.filter((tool) => tool.mode !== 'DISABLED');
  if (enabledTools.length > 0) {
    parts.push(
      `\n\nEnabled MCP tool capabilities:\n${enabledTools
        .map((tool) => `- ${tool.capabilityKey}: ${tool.mode}`)
        .join('\n')}`,
    );
  }

  const fallback = config.fallback;
  if (
    fallback &&
    (fallback.escalateOnRequest || fallback.escalateOnLowConfidence || fallback.escalateOnSensitive)
  ) {
    const triggers: string[] = [];
    if (fallback.escalateOnRequest) triggers.push('when the caller requests a human');
    if (fallback.escalateOnLowConfidence) triggers.push('when you are not confident in your answer');
    if (fallback.escalateOnSensitive) triggers.push('for sensitive topics');
    parts.push(`\n\nEscalation: Transfer the call ${triggers.join(', ')}.`);
    const announcement = fallback.standardAnnouncement || fallback.message;
    if (announcement) {
      parts.push(`If no agent is available, say: "${announcement}"`);
    }
    if (fallback.transferFailedMessage) {
      parts.push(`If transfer fails, say: "${fallback.transferFailedMessage}"`);
    }
    if (fallback.recordCallback) {
      parts.push('Offer to record a callback request when transfer is unavailable.');
    }
    if (fallback.createSupportCase) {
      parts.push('Create an internal support case when transfer or resolution fails.');
    }
    if (fallback.controlledEndCall) {
      parts.push('End the call only after confirming next steps with the caller.');
    }
    if (fallback.avoidFalseSuccessStatus !== false) {
      parts.push('Never claim an action succeeded unless it was actually completed.');
    }
  }

  if (config.privacyRetention.consentNoticeText?.trim()) {
    parts.push(`\n\nPrivacy notice for callers:\n${config.privacyRetention.consentNoticeText}`);
  }

  const transferRules = config.transfer?.rules?.filter((rule) => rule.enabled !== false) ?? [];
  if (transferRules.length > 0) {
    parts.push(
      `\n\nTransfer rules:\n${transferRules
        .map((rule) => `- ${rule.label || rule.ruleId}: ${rule.condition}`)
        .join('\n')}`,
    );
  }

  return parts.join('');
}
