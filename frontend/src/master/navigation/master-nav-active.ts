import type { MasterView } from './master-nav.types';

export interface MasterNavActiveContext {
  view: MasterView;
  settingsTab?: string;
  selectedOrgId?: string | null;
}

export function isMasterNavItemActive(itemId: MasterView, ctx: MasterNavActiveContext): boolean {
  if (itemId === 'organizations') {
    return ctx.view === 'organizations';
  }
  if (itemId === 'platform-integrations') {
    return ctx.view === 'platform-integrations' || ctx.view === 'settings';
  }
  if (itemId === 'security-access') {
    return ctx.view === 'security-access' || ctx.view === 'users' || ctx.view === 'activity-log';
  }
  if (itemId === 'vehicles') {
    return ctx.view === 'vehicles' || ctx.view === 'fleet-connection';
  }
  if (itemId === 'platform-ops') {
    return ctx.view === 'platform-ops' || ctx.view === 'platform-health';
  }
  return ctx.view === itemId;
}

export function isMasterNavGroupActive(groupItemIds: MasterView[], ctx: MasterNavActiveContext): boolean {
  return groupItemIds.some((id) => isMasterNavItemActive(id, ctx));
}
