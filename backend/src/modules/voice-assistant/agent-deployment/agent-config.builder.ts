import type { VoiceAssistant } from '@prisma/client';
import {
  buildToolPolicyForAssistant,
} from '../voice-assistant-permissions';
import type {
  AgentBusinessHours,
  AgentKnowledgeRef,
  AgentMcpToolRef,
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
    fallback: {
      message: assistant.fallbackMessage,
      escalateOnRequest: assistant.escalateOnRequest,
      escalateOnLowConfidence: assistant.escalateOnLowConf,
      escalateOnSensitive: assistant.escalateOnSensitive,
      escalationDepartment: assistant.escalationDepartment,
    },
    mcpToolRefs: readMcpToolRefs(assistant),
    knowledgeRefs: readKnowledgeRefs(assistant),
    privacyRetention: {
      storeTranscripts: true,
      retentionDays: null,
      redactPii: true,
    },
  };
}

export function mergeCanonicalAgentConfig(
  base: CanonicalAgentConfig,
  patch: CanonicalAgentConfigPatch,
): CanonicalAgentConfig {
  return {
    ...base,
    ...patch,
    dynamicVariables: patch.dynamicVariables ?? base.dynamicVariables,
    mcpToolRefs: patch.mcpToolRefs ?? base.mcpToolRefs,
    knowledgeRefs: patch.knowledgeRefs ?? base.knowledgeRefs,
    businessHours:
      patch.businessHours === undefined ? base.businessHours : patch.businessHours,
    fallback: patch.fallback === undefined ? base.fallback : patch.fallback,
    privacyRetention: {
      ...base.privacyRetention,
      ...(patch.privacyRetention ?? {}),
    },
  };
}

export function parseCanonicalAgentConfigSnapshot(value: unknown): CanonicalAgentConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Partial<CanonicalAgentConfig>;
  if (!row.assistantName || !row.language) {
    return null;
  }
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
    fallback: row.fallback ?? null,
    mcpToolRefs: Array.isArray(row.mcpToolRefs) ? row.mcpToolRefs : [],
    knowledgeRefs: Array.isArray(row.knowledgeRefs) ? row.knowledgeRefs : [],
    privacyRetention: {
      storeTranscripts: row.privacyRetention?.storeTranscripts ?? true,
      retentionDays: row.privacyRetention?.retentionDays ?? null,
      redactPii: row.privacyRetention?.redactPii ?? true,
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
    if (fallback.message) {
      parts.push(`If no agent is available, say: "${fallback.message}"`);
    }
  }

  return parts.join('');
}
