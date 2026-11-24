import type { LucideIcon } from 'lucide-react';

/** Canonical + legacy view ids (legacy resolve via URL redirects). */
export type MasterView =
  | 'dashboard'
  | 'organizations'
  | 'security-access'
  | 'users'
  | 'vehicles'
  | 'device-inventory'
  | 'prospects'
  | 'billing'
  | 'product-management'
  | 'activity-log'
  | 'platform-ops'
  | 'platform-health'
  | 'support'
  | 'platform-integrations'
  | 'service-client-management'
  | 'settings'
  | 'fleet-connection'
  | 'parts-accessories'
  | 'insurances'
  | 'voice-assistant'
  | 'high-mobility'
  | 'architektur'
  | 'changes'
  | 'battery-v2-shadow-inspection'
  | 'battery-v2-hv-inspection'
  | 'vsi-intelligence'
  | 'apds-intelligence'
  | 'tire-v3-calibration-center'
  /** @deprecated URL redirect only */
  | 'hm-compatibility'
  /** @deprecated URL redirect only */
  | 'health-tracking'
  /** @deprecated URL redirect only */
  | 'trip-detection-logic'
  /** @deprecated URL redirect only */
  | 'performance-logic'
  /** @deprecated Master UI removed — redirects to vehicles overview */
  | 'vehicle-logbook';

export type MasterNavBadgeType =
  | 'platform-critical'
  | 'support-count'
  | 'billing-anomaly'
  | 'integration-attention'
  | 'integration-outage'
  | 'connectivity-warning'
  | 'mfa-required'
  | 'security-attention';

export type MasterNavPermission = 'MASTER_ADMIN' | 'master-billing';

export type MasterNavGroupId =
  | 'verwaltung'
  | 'produkte-business'
  | 'plattform'
  | 'intelligence'
  | 'engineering';

export interface MasterNavItemConfig {
  id: MasterView;
  labelKey: string;
  icon: LucideIcon;
  permissions: MasterNavPermission[];
  badge?: MasterNavBadgeType;
}

export type MasterNavEntry =
  | { type: 'link'; view: MasterView }
  | { type: 'parent'; view: MasterView; children: MasterView[] }
  | { type: 'folder'; labelKey: string; children: MasterView[] };

export interface MasterNavGroupConfig {
  id: MasterNavGroupId;
  labelKey: string;
  collapsible: boolean;
  defaultExpanded: boolean;
  entries: MasterNavEntry[];
}

export interface MasterNavLocationState {
  view: MasterView;
  settingsTab?: string;
  orgId?: string | null;
  /** Active tab on organization detail (`orgTab` query param). */
  orgTab?: string | null;
  archCategory?: string | null;
  hmTab?: string | null;
}