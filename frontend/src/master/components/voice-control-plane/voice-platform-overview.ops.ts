import type {
  VoiceControlPlaneOrganizationRow,
  VoiceControlPlanePlatformStatus,
  VoicePlatformHealthState,
} from '../../../lib/api';

export type VoiceOrgFilterKey =
  | 'plan'
  | 'rollout'
  | 'providerHealth'
  | 'budgetStatus'
  | 'provisioningFailed'
  | 'incidents';

export interface VoiceOrgFilters {
  search: string;
  plan: string | 'all';
  rollout: string | 'all';
  providerHealth: string | 'all';
  budgetStatus: string | 'all';
  provisioningFailed: boolean;
  incidentsOnly: boolean;
}

export const DEFAULT_VOICE_ORG_FILTERS: VoiceOrgFilters = {
  search: '',
  plan: 'all',
  rollout: 'all',
  providerHealth: 'all',
  budgetStatus: 'all',
  provisioningFailed: false,
  incidentsOnly: false,
};

export function healthStateTone(
  state: VoicePlatformHealthState,
): 'success' | 'warning' | 'critical' | 'neutral' | 'noData' {
  switch (state) {
    case 'healthy':
      return 'success';
    case 'degraded':
      return 'warning';
    case 'incident':
      return 'critical';
    case 'disabled':
      return 'neutral';
    default:
      return 'noData';
  }
}

export function problemStatusTone(
  status: VoiceControlPlaneOrganizationRow['problemStatus'],
): 'success' | 'warning' | 'critical' | 'neutral' {
  switch (status) {
    case 'ok':
      return 'success';
    case 'warning':
      return 'warning';
    case 'critical':
    case 'incident':
      return 'critical';
    default:
      return 'neutral';
  }
}

export function maskOrgId(orgId: string): string {
  if (orgId.length <= 10) return orgId;
  return `${orgId.slice(0, 4)}…${orgId.slice(-4)}`;
}

export function filterOrganizations(
  rows: VoiceControlPlaneOrganizationRow[],
  filters: VoiceOrgFilters,
): VoiceControlPlaneOrganizationRow[] {
  const term = filters.search.trim().toLowerCase();
  return rows.filter(row => {
    if (term) {
      const haystack = `${row.organizationName} ${row.organizationId} ${row.planCode ?? ''}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (filters.plan !== 'all' && row.planCode !== filters.plan) return false;
    if (filters.rollout !== 'all' && row.rolloutStatus !== filters.rollout) return false;
    if (filters.providerHealth !== 'all' && row.providerHealth !== filters.providerHealth) return false;
    if (filters.budgetStatus !== 'all' && row.budgetStatus !== filters.budgetStatus) return false;
    if (filters.provisioningFailed && !row.provisioningFailed) return false;
    if (filters.incidentsOnly && row.problemStatus === 'ok') return false;
    return true;
  });
}

export function uniquePlanCodes(rows: VoiceControlPlaneOrganizationRow[]): string[] {
  return [...new Set(rows.map(r => r.planCode).filter((p): p is string => Boolean(p)))].sort();
}

export function platformProviderRows(status: VoiceControlPlanePlatformStatus | null) {
  if (!status) return [];
  const entries = [
    ['elevenLabs', 'ElevenLabs'],
    ['twilioIe1', 'Twilio IE1'],
    ['mcpGateway', 'MCP Gateway'],
    ['webhookIngestion', 'Webhook Ingestion'],
  ] as const;
  return entries.map(([key, title]) => ({
    key,
    title,
    ...status.providers[key],
  }));
}

export function nextOrgAction(row: VoiceControlPlaneOrganizationRow): string | null {
  if (row.provisioningFailed) return 'Provisioning prüfen';
  if (row.problemStatus === 'critical') return 'Incident bearbeiten';
  if (row.agentDeploymentStatus === 'DRAFT') return 'Agent deployen';
  if (row.assistantStatus === 'NOT_CONFIGURED') return 'Onboarding starten';
  if (row.budgetStatus === 'over_limit') return 'Budget prüfen';
  if (row.problemStatus === 'warning') return 'Workspace öffnen';
  return null;
}
