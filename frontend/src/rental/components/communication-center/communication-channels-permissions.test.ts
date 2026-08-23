import { describe, expect, it } from 'vitest';

import {
  canAccessCommunicationChannels,
  canAccessCommunicationChannelsSection,
  canAccessWorkflowAutomations,
} from './communication-channels-permissions';

const manageAll = (module: string, action: string) => {
  if (module === 'communication' && (action === 'read' || action === 'manage')) return true;
  if (module === 'workflow-automation' && action === 'read') return true;
  return false;
};

const readOnly = (module: string, action: string) =>
  module === 'communication' && action === 'read';

describe('communication-channels-permissions', () => {
  it('allows communication.read users to access channels landing', () => {
    expect(canAccessCommunicationChannels(readOnly)).toBe(true);
  });

  it('restricts whatsapp channel section to manage permission', () => {
    expect(canAccessCommunicationChannelsSection('whatsapp', readOnly)).toBe(false);
    expect(canAccessCommunicationChannelsSection('whatsapp', manageAll)).toBe(true);
  });

  it('allows overview for communication.read', () => {
    expect(canAccessCommunicationChannelsSection('overview', readOnly)).toBe(true);
  });

  it('gates workflow automations on workflow-automation.read', () => {
    expect(canAccessWorkflowAutomations(readOnly)).toBe(false);
    expect(canAccessWorkflowAutomations(manageAll)).toBe(true);
  });
});
