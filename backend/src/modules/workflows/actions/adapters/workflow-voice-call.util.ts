import type { VoiceAssistant } from '@prisma/client';
import type { AgentBusinessHours } from '@modules/voice-assistant/agent-deployment/agent-config.types';

export function readBusinessHoursFromAssistant(
  assistant: Pick<
    VoiceAssistant,
    'businessHours' | 'businessHoursStart' | 'businessHoursEnd' | 'businessHoursTimezone'
  >,
): AgentBusinessHours | null {
  const raw = assistant.businessHours;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as AgentBusinessHours;
  }
  if (
    assistant.businessHoursStart ||
    assistant.businessHoursEnd ||
    assistant.businessHoursTimezone
  ) {
    return {
      timezone: assistant.businessHoursTimezone,
      start: assistant.businessHoursStart,
      end: assistant.businessHoursEnd,
    };
  }
  return null;
}
