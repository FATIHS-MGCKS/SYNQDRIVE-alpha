import { getStoredUser, hasMasterBillingAccess, isMasterAdmin } from '../../lib/auth';
import type { MasterNavItemConfig, MasterNavPermission, MasterView } from './master-nav.types';
import { MASTER_NAV_ITEMS } from './master-nav.config';

export function hasMasterNavPermission(permission: MasterNavPermission): boolean {
  if (permission === 'MASTER_ADMIN') return isMasterAdmin();
  if (permission === 'master-billing') return hasMasterBillingAccess();
  return false;
}

export function canAccessMasterNavItem(item: MasterNavItemConfig): boolean {
  return item.permissions.some((p) => hasMasterNavPermission(p));
}

export function isBillingOnlyMasterUser(): boolean {
  const user = getStoredUser();
  if (!user) return false;
  if (user.platformRole === 'MASTER_ADMIN') return false;
  return hasMasterBillingAccess();
}

export function getVisibleMasterNavItemIds(): MasterView[] {
  if (isBillingOnlyMasterUser()) {
    return ['dashboard', 'billing'];
  }
  return MASTER_NAV_ITEMS.filter(canAccessMasterNavItem).map((i) => i.id);
}
