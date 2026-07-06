/** Administration sub-pages — shared between SettingsView, Sidebar, and App routing. */
export type SettingsTab =
  | 'account'
  | 'company'
  | 'users'
  | 'billing'
  | 'data-authorization'
  | 'legal-documents'
  | 'rental-rules';

/** @deprecated Removed from Administration (V4.9.206) — migrated to Fleet → Connectivity. */
export const LEGACY_SETTINGS_TAB_FLEET_CONNECTION = 'fleet-connection' as const;

export type LegacySettingsTab = typeof LEGACY_SETTINGS_TAB_FLEET_CONNECTION;

export type SettingsTabInput = SettingsTab | LegacySettingsTab;

export function isLegacyFleetConnectionSettingsTab(
  tab: string | null | undefined,
): tab is LegacySettingsTab {
  return tab === LEGACY_SETTINGS_TAB_FLEET_CONNECTION;
}

/** Canonical tab order for the in-page Administration tab bar. */
export const ADMINISTRATION_TAB_ORDER: SettingsTab[] = [
  'company',
  'account',
  'users',
  'billing',
  'data-authorization',
  'legal-documents',
  'rental-rules',
];
