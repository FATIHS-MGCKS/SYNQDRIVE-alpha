import { VoiceAssistant } from '@prisma/client';

export type VoiceTestSessionStatus = 'ready' | 'blocked';

export interface VoiceTestSessionResponse {
  agentId: string | null;
  provider: string;
  status: VoiceTestSessionStatus;
  mode: 'simulation' | 'live';
  instructions: string;
  expiresAt: string | null;
  warnings: string[];
  readinessSummary: {
    ready: boolean;
    missing: string[];
  };
  developerDetails: {
    signedUrl: string;
  } | null;
}

export function buildTestSessionWarnings(assistant: VoiceAssistant): string[] {
  const warnings: string[] = [];

  if (!assistant.elevenLabsAgentId) {
    warnings.push('Agent is not provisioned yet — use simulation tests before activation.');
  }
  if (!assistant.voiceId?.trim()) {
    warnings.push('No voice selected — callers will not hear the intended brand voice.');
  }
  if (!assistant.systemPrompt?.trim()) {
    warnings.push('System prompt is empty — assistant behavior is undefined.');
  }
  if (!assistant.greetingMessage?.trim()) {
    warnings.push('Greeting message is missing — first impression may be generic.');
  }
  if (!assistant.escalationPhone?.trim() && !assistant.fallbackMessage?.trim()) {
    warnings.push('Escalation or fallback message not configured — handover paths are unclear.');
  }

  return warnings;
}

export function isTestSessionBlocked(assistant: VoiceAssistant): boolean {
  return !assistant.voiceId?.trim() || !assistant.systemPrompt?.trim();
}
