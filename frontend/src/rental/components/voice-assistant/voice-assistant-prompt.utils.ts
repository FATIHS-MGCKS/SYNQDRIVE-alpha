import type { VoiceAssistantData } from '../../../lib/api';
import type { PromptPreviewSection } from './voice-assistant-builder.types';

function fieldSection(
  title: string,
  value: string | null | undefined,
  missing: string,
): PromptPreviewSection {
  const trimmed = value?.trim();
  return {
    title,
    content: trimmed || null,
    missing: trimmed ? undefined : missing,
  };
}

export function buildPromptPreviewSections(
  fields: {
    name: string;
    role: string;
    language: string;
    personality: string;
    greetingMessage: string;
    companyContext: string;
    businessRules: string;
    forbiddenActions: string;
    knowledgeSnippets: string;
    systemPrompt: string;
  },
  assistant: VoiceAssistantData,
): { sections: PromptPreviewSection[]; hasManualOverride: boolean } {
  const hasManualOverride = Boolean(fields.systemPrompt.trim());

  const sections: PromptPreviewSection[] = [
    {
      title: 'Identity',
      content: [
        fields.name.trim() && `Name: ${fields.name.trim()}`,
        fields.role.trim() && `Role: ${fields.role.trim()}`,
        fields.language.trim() && `Language: ${fields.language.trim()}`,
        fields.personality.trim() && `Tone: ${fields.personality.trim()}`,
        fields.greetingMessage.trim() && `Greeting: "${fields.greetingMessage.trim()}"`,
      ]
        .filter(Boolean)
        .join('\n') || null,
      missing: !fields.name.trim() && !fields.role.trim() ? 'Add assistant name and role.' : undefined,
    },
    fieldSection(
      'Company knowledge',
      fields.companyContext,
      'Describe your company, services, and how callers should be helped.',
    ),
    fieldSection(
      'Business rules',
      fields.businessRules,
      'Add rental policies the assistant must follow.',
    ),
    fieldSection(
      'Forbidden actions',
      fields.forbiddenActions,
      'Define what the assistant must never do (pricing, cancellations, sensitive data).',
    ),
    {
      title: 'Escalation behavior',
      content: [
        assistant.escalateOnRequest && '• Transfer when caller requests a human',
        assistant.escalateOnLowConf && '• Transfer on low-confidence answers',
        assistant.escalateOnSensitive && '• Transfer on sensitive topics',
        assistant.escalationPhone?.trim() && `• Escalation phone: ${assistant.escalationPhone.trim()}`,
        assistant.fallbackMessage?.trim() && `• Fallback: "${assistant.fallbackMessage.trim()}"`,
      ]
        .filter(Boolean)
        .join('\n') || null,
      missing: !assistant.escalationPhone?.trim() ? 'Configure escalation in the Escalation tab.' : undefined,
    },
    fieldSection(
      'Knowledge snippets',
      fields.knowledgeSnippets,
      'Add short FAQ blocks for common caller questions.',
    ),
  ];

  if (hasManualOverride) {
    sections.push({
      title: 'Manual system prompt override',
      content: fields.systemPrompt.trim().length > 600
        ? `${fields.systemPrompt.trim().slice(0, 600)}…`
        : fields.systemPrompt.trim(),
      missing: undefined,
    });
  }

  return { sections, hasManualOverride };
}

export function toggleForbiddenRuleLine(current: string, line: string, enabled: boolean): string {
  const lines = current
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const without = lines.filter(l => l !== line);
  if (enabled) {
    return [...without, line].join('\n');
  }
  return without.join('\n');
}

export function isForbiddenRuleEnabled(current: string, line: string): boolean {
  return current
    .split('\n')
    .map(l => l.trim())
    .includes(line);
}

export function extractCustomForbiddenLines(current: string, knownLines: string[]): string {
  const known = new Set(knownLines);
  return current
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !known.has(l))
    .join('\n');
}
