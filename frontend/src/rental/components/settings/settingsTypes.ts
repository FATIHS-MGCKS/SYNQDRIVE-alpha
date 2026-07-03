/** Administration sub-pages — shared between SettingsView, Sidebar, and App routing. */
export type SettingsTab =
  | 'account'
  | 'company'
  | 'fleet-connection'
  | 'users'
  | 'billing'
  | 'data-authorization'
  | 'legal-documents'
  | 'rental-rules';

/** Canonical tab order for the in-page Administration tab bar. */
export const ADMINISTRATION_TAB_ORDER: SettingsTab[] = [
  'company',
  'account',
  'users',
  'fleet-connection',
  'billing',
  'data-authorization',
  'legal-documents',
  'rental-rules',
];
