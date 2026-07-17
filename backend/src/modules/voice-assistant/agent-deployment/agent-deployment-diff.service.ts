import { Injectable } from '@nestjs/common';
import { maskExternalId } from '../elevenlabs-provider/elevenlabs-provider.redaction';
import { maskE164 } from '@modules/twilio/provisioning/twilio-provisioning.masking';
import type {
  AgentDeploymentDiffEntry,
  AgentDeploymentDiffView,
  CanonicalAgentConfig,
} from './agent-config.types';
import { hashCanonicalAgentConfig } from './agent-config.hash';

function maskIfSensitive(field: string, value: unknown): string | null {
  if (value == null) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const lower = field.toLowerCase();
  if (lower.includes('voiceid') || lower.includes('voice_id')) {
    return maskExternalId(text, 'voice');
  }
  if (lower.includes('phone') || lower.includes('e164')) {
    return maskE164(text);
  }
  if (lower.includes('refid') || lower.includes('external') || lower.includes('mcp')) {
    return maskExternalId(text, 'ref');
  }
  if (text.length > 240) {
    return `${text.slice(0, 237)}...`;
  }
  return text;
}

function summarizeBusinessHours(value: CanonicalAgentConfig['businessHours']): string | null {
  if (!value) return null;
  const parts: string[] = [];
  if (value.timezone) parts.push(`tz=${value.timezone}`);
  if (value.start && value.end) parts.push(`${value.start}-${value.end}`);
  if (value.schedule?.length) parts.push(`${value.schedule.length} day rules`);
  return parts.length > 0 ? parts.join(', ') : null;
}

function summarizeToolRefs(value: CanonicalAgentConfig['mcpToolRefs']): string | null {
  if (!value.length) return 'No tools enabled';
  const enabled = value.filter((tool) => tool.mode !== 'DISABLED');
  return `${enabled.length} enabled / ${value.length} configured`;
}

function summarizeKnowledgeRefs(value: CanonicalAgentConfig['knowledgeRefs']): string | null {
  if (!value.length) return 'None';
  return `${value.length} reference(s)`;
}

function summarizePrivacy(value: CanonicalAgentConfig['privacyRetention']): string | null {
  const parts: string[] = [];
  parts.push(value.storeTranscripts ? 'store transcripts' : 'no transcript storage');
  if (value.retentionDays != null) parts.push(`${value.retentionDays}d retention`);
  parts.push(value.redactPii ? 'PII redaction on' : 'PII redaction off');
  return parts.join(', ');
}

const DIFF_FIELDS: Array<{
  key: keyof CanonicalAgentConfig | 'businessHoursSummary' | 'toolSummary' | 'knowledgeSummary' | 'privacySummary';
  label: string;
  read: (config: CanonicalAgentConfig) => unknown;
}> = [
  { key: 'assistantName', label: 'Assistant name', read: (c) => c.assistantName },
  { key: 'language', label: 'Language', read: (c) => c.language },
  { key: 'voiceId', label: 'Voice', read: (c) => c.voiceName || c.voiceId },
  { key: 'greeting', label: 'Greeting', read: (c) => c.greeting },
  { key: 'systemPrompt', label: 'System prompt', read: (c) => c.systemPrompt },
  { key: 'companyContext', label: 'Company context', read: (c) => c.companyContext },
  { key: 'businessRules', label: 'Business rules', read: (c) => c.businessRules },
  { key: 'forbiddenActions', label: 'Forbidden actions', read: (c) => c.forbiddenActions },
  {
    key: 'businessHoursSummary',
    label: 'Business hours',
    read: (c) => summarizeBusinessHours(c.businessHours),
  },
  {
    key: 'toolSummary',
    label: 'MCP tool permissions',
    read: (c) => summarizeToolRefs(c.mcpToolRefs),
  },
  {
    key: 'knowledgeSummary',
    label: 'Knowledge references',
    read: (c) => summarizeKnowledgeRefs(c.knowledgeRefs),
  },
  {
    key: 'privacySummary',
    label: 'Privacy / retention',
    read: (c) => summarizePrivacy(c.privacyRetention),
  },
  {
    key: 'fallback',
    label: 'Fallback / escalation',
    read: (c) => c.fallback?.message ?? null,
  },
];

@Injectable()
export class AgentDeploymentDiffService {
  buildDiff(params: {
    draft: CanonicalAgentConfig;
    draftDeploymentId: string;
    activeConfig: CanonicalAgentConfig | null;
    activeVersion: number | null;
  }): AgentDeploymentDiffView {
    const activeHash = params.activeConfig ? hashCanonicalAgentConfig(params.activeConfig) : null;
    const draftHash = hashCanonicalAgentConfig(params.draft);

    const changes: AgentDeploymentDiffEntry[] = DIFF_FIELDS.map((field) => {
      const activeRaw = params.activeConfig ? field.read(params.activeConfig) : null;
      const draftRaw = field.read(params.draft);
      const activeValue = maskIfSensitive(String(field.key), activeRaw);
      const draftValue = maskIfSensitive(String(field.key), draftRaw);
      const changed = JSON.stringify(activeRaw ?? null) !== JSON.stringify(draftRaw ?? null);
      return {
        field: String(field.key),
        label: field.label,
        activeValue,
        draftValue,
        changed,
      };
    }).filter((entry) => entry.changed || !params.activeConfig);

    return {
      hasActiveDeployment: Boolean(params.activeConfig),
      activeVersion: params.activeVersion,
      draftDeploymentId: params.draftDeploymentId,
      configHashMatchesActive: Boolean(activeHash && activeHash === draftHash),
      changes,
    };
  }
}
