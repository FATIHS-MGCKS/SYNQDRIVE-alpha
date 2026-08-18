import {
  LayoutDashboard,
  Building2,
  Target,
  Users,
  Car,
  BookOpen,
  CreditCard,
  Network,
  Radio,
  Package,
  Shield,
  Phone,
  HeartPulse,
  Headphones,
  History,
  Code2,
  FileText,
} from 'lucide-react';
import type { MasterNavGroupConfig, MasterNavItemConfig } from './master-nav.types';

export const MASTER_NAV_ITEMS: MasterNavItemConfig[] = [
  { id: 'dashboard', labelKey: 'master.nav.dashboard', icon: LayoutDashboard, permissions: ['MASTER_ADMIN'], mobilePrimary: true },
  { id: 'organizations', labelKey: 'master.nav.organizations', icon: Building2, permissions: ['MASTER_ADMIN'], mobilePrimary: true },
  { id: 'prospects', labelKey: 'master.nav.prospects', icon: Target, permissions: ['MASTER_ADMIN'] },
  { id: 'users', labelKey: 'master.nav.users', icon: Users, permissions: ['MASTER_ADMIN'] },
  { id: 'vehicles', labelKey: 'master.nav.vehicles', icon: Car, permissions: ['MASTER_ADMIN'], badge: 'connectivity-warning', mobilePrimary: true },
  { id: 'vehicle-logbook', labelKey: 'master.nav.vehicleLogbook', icon: BookOpen, permissions: ['MASTER_ADMIN'] },
  { id: 'billing', labelKey: 'master.nav.billing', icon: CreditCard, permissions: ['MASTER_ADMIN', 'master-billing'], badge: 'billing-anomaly' },
  { id: 'fleet-connection', labelKey: 'master.nav.vehicleConnectivity', icon: Network, permissions: ['MASTER_ADMIN'], badge: 'integration-outage' },
  { id: 'high-mobility', labelKey: 'master.nav.highMobility', icon: Radio, permissions: ['MASTER_ADMIN'], badge: 'integration-outage' },
  { id: 'parts-accessories', labelKey: 'master.nav.partsAccessories', icon: Package, permissions: ['MASTER_ADMIN'] },
  { id: 'insurances', labelKey: 'master.nav.insurances', icon: Shield, permissions: ['MASTER_ADMIN'] },
  { id: 'voice-assistant', labelKey: 'master.nav.voiceAssistant', icon: Phone, permissions: ['MASTER_ADMIN'] },
  { id: 'platform-health', labelKey: 'master.nav.platformHealth', icon: HeartPulse, permissions: ['MASTER_ADMIN'], badge: 'platform-critical', mobilePrimary: true },
  { id: 'support', labelKey: 'master.nav.support', icon: Headphones, permissions: ['MASTER_ADMIN'], badge: 'support-count', mobilePrimary: true },
  { id: 'activity-log', labelKey: 'master.nav.activityLog', icon: History, permissions: ['MASTER_ADMIN'] },
  { id: 'architektur', labelKey: 'master.nav.architecture', icon: Code2, permissions: ['MASTER_ADMIN'] },
  { id: 'changes', labelKey: 'master.nav.changes', icon: FileText, permissions: ['MASTER_ADMIN'] },
];

export const MASTER_NAV_ITEM_BY_ID = Object.fromEntries(
  MASTER_NAV_ITEMS.map((item) => [item.id, item]),
) as Record<string, MasterNavItemConfig>;

export const MASTER_NAV_GROUPS: MasterNavGroupConfig[] = [
  { id: 'overview', labelKey: 'master.nav.group.overview', collapsible: false, defaultExpanded: true, items: ['dashboard'] },
  { id: 'tenants', labelKey: 'master.nav.group.tenants', collapsible: false, defaultExpanded: true, items: ['organizations', 'prospects', 'users'] },
  { id: 'fleet', labelKey: 'master.nav.group.fleet', collapsible: false, defaultExpanded: true, items: ['vehicles', 'vehicle-logbook'] },
  { id: 'commerce', labelKey: 'master.nav.group.commerce', collapsible: false, defaultExpanded: true, items: ['billing'] },
  { id: 'connectivity', labelKey: 'master.nav.group.connectivity', collapsible: true, defaultExpanded: true, items: ['high-mobility'] },
  { id: 'partners', labelKey: 'master.nav.group.partners', collapsible: true, defaultExpanded: true, items: ['parts-accessories', 'insurances', 'voice-assistant'] },
  { id: 'operations', labelKey: 'master.nav.group.operations', collapsible: true, defaultExpanded: true, items: ['platform-health', 'support', 'activity-log'] },
  { id: 'engineering', labelKey: 'master.nav.group.engineering', collapsible: true, defaultExpanded: false, items: ['architektur', 'changes'] },
];

export const MASTER_MOBILE_PRIMARY_VIEWS = MASTER_NAV_ITEMS
  .filter((i) => i.mobilePrimary)
  .map((i) => i.id);

export function getGroupIdForView(view: string): string | null {
  for (const group of MASTER_NAV_GROUPS) {
    if (group.items.includes(view as never)) return group.id;
  }
  if (view === 'settings') return null;
  return null;
}
