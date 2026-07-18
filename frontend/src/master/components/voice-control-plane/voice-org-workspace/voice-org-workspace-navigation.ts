export const VOICE_ORG_WORKSPACE_TABS = [
  { id: 'overview', label: 'Übersicht' },
  { id: 'provisioning', label: 'Provisionierung' },
  { id: 'phone-numbers', label: 'Telefonnummern' },
  { id: 'agent', label: 'Agent' },
  { id: 'conversations', label: 'Gespräche' },
  { id: 'billing', label: 'Usage & Billing' },
  { id: 'events', label: 'Events' },
  { id: 'audit', label: 'Audit' },
] as const;

export type VoiceOrgWorkspaceTab = (typeof VOICE_ORG_WORKSPACE_TABS)[number]['id'];

export function readVoiceOrgWorkspaceTab(search: string): VoiceOrgWorkspaceTab {
  const params = new URLSearchParams(search);
  const tab = params.get('voiceOrgTab');
  if (VOICE_ORG_WORKSPACE_TABS.some(item => item.id === tab)) {
    return tab as VoiceOrgWorkspaceTab;
  }
  return 'overview';
}

export function readVoiceOrgId(search: string): string | null {
  return new URLSearchParams(search).get('voiceOrgId');
}

export function buildVoiceOrgWorkspaceSearch(
  section: string,
  orgId: string,
  tab: VoiceOrgWorkspaceTab = 'overview',
): string {
  const params = new URLSearchParams();
  params.set('voiceSection', section);
  params.set('voiceOrgId', orgId);
  params.set('voiceOrgTab', tab);
  return `?${params.toString()}`;
}
