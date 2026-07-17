import { VoiceAssistant, VoiceAssistantStatus } from '@prisma/client';

export const LEGACY_TWIML_DIAGNOSTIC_COMMENT =
  '<!-- LEGACY_TWIML_SAY diagnostic PSTN test — not a productive ElevenLabs AI call -->';

export function buildInboundVoiceTwiml(assistant: VoiceAssistant | null): string {
  if (!assistant || assistant.status !== VoiceAssistantStatus.ACTIVE) {
    return wrapTwiml('<Say language="en-US">This number is not available right now.</Say>');
  }

  const greeting =
    assistant.greetingMessage?.trim() ||
    assistant.fallbackMessage?.trim() ||
    'Hello. Please hold while we connect you.';

  const language = mapTwilioLanguage(assistant.language);
  const parts: string[] = [LEGACY_TWIML_DIAGNOSTIC_COMMENT, `<Say language="${language}">${escapeXml(greeting)}</Say>`];

  const escalation = assistant.escalationPhone?.trim();
  if (escalation) {
    parts.push(`<Dial>${escapeXml(escalation)}</Dial>`);
  } else {
    parts.push('<Pause length="1"/>');
  }

  return wrapTwiml(parts.join('\n'));
}

export function buildOutboundVoiceTwiml(message: string, language = 'en-US'): string {
  return wrapTwiml(
    `${LEGACY_TWIML_DIAGNOSTIC_COMMENT}<Say language="${language}">${escapeXml(message)}</Say>`,
  );
}

function wrapTwiml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function mapTwilioLanguage(language: string | null | undefined): string {
  const code = (language ?? 'en').toLowerCase();
  if (code.startsWith('de')) return 'de-DE';
  if (code.startsWith('fr')) return 'fr-FR';
  if (code.startsWith('es')) return 'es-ES';
  return 'en-US';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
