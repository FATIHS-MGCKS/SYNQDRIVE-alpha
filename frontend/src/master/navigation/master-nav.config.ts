import {
  LayoutDashboard,
  Building2,
  Target,
  Car,
  BookOpen,
  CreditCard,
  Plug,
  KeyRound,
  Radio,
  Package,
  Shield,
  ShieldCheck,
  Phone,
  HeartPulse,
  Headphones,
  Code2,
  FileText,
  Battery,
  BatteryCharging,
  Boxes,
  Activity,
  Gauge,
  CircleDot,
} from 'lucide-react';
import type { MasterNavGroupConfig, MasterNavItemConfig, MasterNavEntry, MasterView } from './master-nav.types';

export const MASTER_NAV_ITEMS: MasterNavItemConfig[] = [
  { id: 'dashboard', labelKey: 'master.nav.dashboard', icon: LayoutDashboard, permissions: ['MASTER_ADMIN'] },
  { id: 'organizations', labelKey: 'master.nav.organizations', icon: Building2, permissions: ['MASTER_ADMIN'] },
  { id: 'prospects', labelKey: 'master.nav.prospects', icon: Target, permissions: ['MASTER_ADMIN'] },
  { id: 'security-access', labelKey: 'master.nav.securityAccess', icon: ShieldCheck, permissions: ['MASTER_ADMIN'], badge: 'security-attention' },
  { id: 'vehicles', labelKey: 'master.nav.vehicles', icon: Car, permissions: ['MASTER_ADMIN'], badge: 'connectivity-warning' },
  { id: 'device-inventory', labelKey: 'master.nav.deviceInventory', icon: Boxes, permissions: ['MASTER_ADMIN'] },
  { id: 'vehicle-logbook', labelKey: 'master.nav.vehicleLogbook', icon: BookOpen, permissions: ['MASTER_ADMIN'] },
  { id: 'billing', labelKey: 'master.nav.billing', icon: CreditCard, permissions: ['MASTER_ADMIN', 'master-billing'], badge: 'billing-anomaly' },
  { id: 'product-management', labelKey: 'master.nav.productManagement', icon: Package, permissions: ['MASTER_ADMIN'] },
  { id: 'platform-integrations', labelKey: 'master.nav.platformIntegrations', icon: Plug, permissions: ['MASTER_ADMIN'], badge: 'integration-attention' },
  { id: 'service-client-management', labelKey: 'master.nav.serviceClientManagement', icon: KeyRound, permissions: ['MASTER_ADMIN'] },
  { id: 'vsi-intelligence', labelKey: 'master.nav.vsiIntelligence', icon: Activity, permissions: ['MASTER_ADMIN'] },
  { id: 'apds-intelligence', labelKey: 'master.nav.apdsIntelligence', icon: Gauge, permissions: ['MASTER_ADMIN'] },
  { id: 'high-mobility', labelKey: 'master.nav.highMobility', icon: Radio, permissions: ['MASTER_ADMIN'], badge: 'integration-outage' },
  { id: 'parts-accessories', labelKey: 'master.nav.partsAccessories', icon: Package, permissions: ['MASTER_ADMIN'] },
  { id: 'insurances', labelKey: 'master.nav.insurances', icon: Shield, permissions: ['MASTER_ADMIN'] },
  { id: 'voice-assistant', labelKey: 'master.nav.voiceAssistant', icon: Phone, permissions: ['MASTER_ADMIN'] },
  { id: 'platform-ops', labelKey: 'master.nav.platformOps', icon: HeartPulse, permissions: ['MASTER_ADMIN'], badge: 'platform-critical' },
  { id: 'support', labelKey: 'master.nav.support', icon: Headphones, permissions: ['MASTER_ADMIN'], badge: 'support-count' },
  { id: 'battery-v2-shadow-inspection', labelKey: 'master.nav.batteryV2ShadowInspection', icon: Battery, permissions: ['MASTER_ADMIN'] },
  { id: 'battery-v2-hv-inspection', labelKey: 'master.nav.batteryV2HvInspection', icon: BatteryCharging, permissions: ['MASTER_ADMIN'] },
  { id: 'tire-v3-calibration-center', labelKey: 'master.nav.tireV3CalibrationCenter', icon: CircleDot, permissions: ['MASTER_ADMIN'] },
  { id: 'architektur', labelKey: 'master.nav.architecture', icon: Code2, permissions: ['MASTER_ADMIN'] },
  { id: 'changes', labelKey: 'master.nav.changes', icon: FileText, permissions: ['MASTER_ADMIN'] },
];

export const MASTER_NAV_ITEM_BY_ID = Object.fromEntries(
  MASTER_NAV_ITEMS.map((item) => [item.id, item]),
) as Record<string, MasterNavItemConfig>;

/** Sidebar V1 — owner-approved group structure (MAUX SIDEBAR_V1). */
export const MASTER_NAV_GROUPS: MasterNavGroupConfig[] = [
  {
    id: 'verwaltung',
    labelKey: 'master.nav.group.verwaltung',
    collapsible: true,
    defaultExpanded: true,
    entries: [
      { type: 'link', view: 'organizations' },
      { type: 'link', view: 'vehicles' },
      { type: 'link', view: 'security-access' },
      { type: 'link', view: 'device-inventory' },
      { type: 'link', view: 'vehicle-logbook' },
    ],
  },
  {
    id: 'produkte-business',
    labelKey: 'master.nav.group.produkteBusiness',
    collapsible: true,
    defaultExpanded: false,
    entries: [
      { type: 'link', view: 'product-management' },
      { type: 'link', view: 'billing' },
      { type: 'link', view: 'prospects' },
      {
        type: 'folder',
        labelKey: 'master.nav.group.partnerServices',
        children: ['parts-accessories', 'insurances'],
      },
    ],
  },
  {
    id: 'plattform',
    labelKey: 'master.nav.group.plattform',
    collapsible: true,
    defaultExpanded: false,
    entries: [
      { type: 'link', view: 'platform-ops' },
      {
        type: 'parent',
        view: 'platform-integrations',
        children: ['high-mobility', 'service-client-management', 'voice-assistant'],
      },
    ],
  },
  {
    id: 'intelligence',
    labelKey: 'master.nav.group.intelligence',
    collapsible: true,
    defaultExpanded: false,
    entries: [
      { type: 'link', view: 'vsi-intelligence' },
      { type: 'link', view: 'apds-intelligence' },
    ],
  },
  {
    id: 'engineering',
    labelKey: 'master.nav.group.engineering',
    collapsible: true,
    defaultExpanded: false,
    entries: [
      { type: 'link', view: 'tire-v3-calibration-center' },
      { type: 'link', view: 'battery-v2-shadow-inspection' },
      { type: 'link', view: 'battery-v2-hv-inspection' },
      { type: 'link', view: 'architektur' },
      { type: 'link', view: 'changes' },
    ],
  },
];

export function collectViewsFromEntry(entry: MasterNavEntry): MasterView[] {
  if (entry.type === 'link') return [entry.view];
  if (entry.type === 'parent') return [entry.view, ...entry.children];
  return [...entry.children];
}

export function collectViewsFromGroup(group: MasterNavGroupConfig): MasterView[] {
  return group.entries.flatMap(collectViewsFromEntry);
}

/** Views rendered in the main sidebar rail (excludes footer-only `support`). */
export function getMasterSidebarMainNavViews(): MasterView[] {
  const views: MasterView[] = ['dashboard'];
  for (const group of MASTER_NAV_GROUPS) {
    views.push(...collectViewsFromGroup(group));
  }
  return views;
}

/** Footer-only views (not in main rail). */
export function getMasterSidebarFooterViews(): MasterView[] {
  return ['support'];
}

export function getGroupIdForView(view: string): string | null {
  if (view === 'dashboard') return null;
  for (const group of MASTER_NAV_GROUPS) {
    if (collectViewsFromGroup(group).includes(view as MasterView)) return group.id;
  }
  if (view === 'settings') return 'plattform';
  return null;
}