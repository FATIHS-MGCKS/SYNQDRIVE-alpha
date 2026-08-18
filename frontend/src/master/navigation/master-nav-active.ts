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
  if (itemId === 'settings') {
    return ctx.view === 'settings';
  }
  return ctx.view === itemId;
}

export function isMasterNavGroupActive(groupItemIds: MasterView[], ctx: MasterNavActiveContext): boolean {
  return groupItemIds.some((id) => isMasterNavItemActive(id, ctx));
}
