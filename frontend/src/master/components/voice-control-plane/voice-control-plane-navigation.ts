export const VOICE_CONTROL_PLANE_SECTIONS = [
  { id: 'platform', label: 'Plattformstatus' },
  { id: 'organizations', label: 'Organisationen' },
  { id: 'provisioning', label: 'Provisionierung' },
  { id: 'phone-numbers', label: 'Telefonnummern' },
  { id: 'deployments', label: 'Agent Deployments' },
  { id: 'webhooks', label: 'Webhooks & Events' },
  { id: 'usage', label: 'Usage & Billing' },
  { id: 'audit', label: 'Audit & Sicherheit' },
] as const;

export type VoiceControlPlaneSection = (typeof VOICE_CONTROL_PLANE_SECTIONS)[number]['id'];

export function readVoiceControlPlaneSection(search: string): VoiceControlPlaneSection {
  const params = new URLSearchParams(search);
  const section = params.get('voiceSection');
  if (VOICE_CONTROL_PLANE_SECTIONS.some((item) => item.id === section)) {
    return section as VoiceControlPlaneSection;
  }
  return 'platform';
}

export function buildVoiceControlPlaneSearch(section: VoiceControlPlaneSection, orgId?: string | null) {
  const params = new URLSearchParams();
  params.set('voiceSection', section);
  if (orgId) params.set('voiceOrgId', orgId);
  return `?${params.toString()}`;
}
