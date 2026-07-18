import { describe, expect, it } from 'vitest';
import {
  buildVoiceOrgWorkspaceSearch,
  readVoiceOrgId,
  readVoiceOrgWorkspaceTab,
} from './voice-org-workspace-navigation';

describe('voice-org-workspace-navigation', () => {
  it('reads org id and tab from URL', () => {
    const search = '?voiceSection=organizations&voiceOrgId=org-abc&voiceOrgTab=provisioning';
    expect(readVoiceOrgId(search)).toBe('org-abc');
    expect(readVoiceOrgWorkspaceTab(search)).toBe('provisioning');
  });

  it('defaults tab to overview', () => {
    expect(readVoiceOrgWorkspaceTab('?voiceOrgId=org-1')).toBe('overview');
  });

  it('builds workspace search params', () => {
    const search = buildVoiceOrgWorkspaceSearch('organizations', 'org-1', 'billing');
    expect(search).toContain('voiceOrgId=org-1');
    expect(search).toContain('voiceOrgTab=billing');
  });
});
