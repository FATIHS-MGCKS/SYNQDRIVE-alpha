import type { PlatformIntegrationsLocation, PlatformIntegrationsSection, SettingsCategory } from './types';

const DEFAULT: PlatformIntegrationsLocation = {
  section: 'overview',
  integrationId: null,
  settingsCategory: 'communication',
  attentionOnly: false,
};

const VALID_SECTIONS: PlatformIntegrationsSection[] = [
  'overview',
  'integrations',
  'webhooks',
  'settings',
  'changelog',
];

const VALID_CATEGORIES: SettingsCategory[] = [
  'communication',
  'billing',
  'vehicles',
  'flags',
  'operations',
];

export function readPlatformIntegrationsLocation(search: string): PlatformIntegrationsLocation {
  const p = new URLSearchParams(search);
  const section = (p.get('platformIntegrations') as PlatformIntegrationsSection) ?? DEFAULT.section;
  const settingsCategory = (p.get('settingsCategory') as SettingsCategory) ?? DEFAULT.settingsCategory;

  return {
    section: VALID_SECTIONS.includes(section) ? section : 'overview',
    integrationId: p.get('integrationId'),
    settingsCategory: VALID_CATEGORIES.includes(settingsCategory) ? settingsCategory : 'communication',
    attentionOnly: p.get('attentionOnly') === '1',
  };
}

export function syncPlatformIntegrationsUrl(
  loc: Partial<PlatformIntegrationsLocation>,
  opts?: { replace?: boolean },
) {
  if (typeof window === 'undefined') return;
  const current = readPlatformIntegrationsLocation(window.location.search);
  const next: PlatformIntegrationsLocation = { ...current, ...loc };
  const params = new URLSearchParams(window.location.search);

  params.set('view', 'platform-integrations');
  params.set('platformIntegrations', next.section);

  if (next.integrationId) params.set('integrationId', next.integrationId);
  else params.delete('integrationId');

  if (next.section === 'settings') params.set('settingsCategory', next.settingsCategory);
  else params.delete('settingsCategory');

  if (next.attentionOnly) params.set('attentionOnly', '1');
  else params.delete('attentionOnly');

  params.delete('settingsTab');

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  if (opts?.replace) window.history.replaceState(null, '', nextUrl);
  else window.history.pushState(null, '', nextUrl);
}

export function migratePlatformIntegrationsParams(search: string): string {
  const p = new URLSearchParams(search);
  const view = p.get('view');
  if (view !== 'settings') return search;

  p.set('view', 'platform-integrations');
  const tab = p.get('settingsTab');
  if (tab === 'email') {
    p.set('platformIntegrations', 'settings');
    p.set('settingsCategory', 'communication');
  } else if (tab === 'integrations') {
    p.set('platformIntegrations', 'integrations');
  } else {
    p.set('platformIntegrations', 'settings');
  }
  p.delete('settingsTab');
  return `?${p.toString()}`;
}
