import type { SettingsTab } from './settingsTypes';
import { ADMINISTRATION_TAB_ORDER } from './settingsTypes';

export const ADMIN_TAB_ID: Record<SettingsTab, string> = {
  company: 'admin-tab-company',
  account: 'admin-tab-account',
  users: 'admin-tab-users',
  billing: 'admin-tab-billing',
  'data-authorization': 'admin-tab-data-authorization',
  'legal-documents': 'admin-tab-legal-documents',
  'email-versand': 'admin-tab-email-versand',
  'rental-rules': 'admin-tab-rental-rules',
};

export const ADMIN_TAB_PANEL_ID: Record<SettingsTab, string> = {
  company: 'admin-panel-company',
  account: 'admin-panel-account',
  users: 'admin-panel-users',
  billing: 'admin-panel-billing',
  'data-authorization': 'admin-panel-data-authorization',
  'legal-documents': 'admin-panel-legal-documents',
  'email-versand': 'admin-panel-email-versand',
  'rental-rules': 'admin-panel-rental-rules',
};

export { ADMINISTRATION_TAB_ORDER };
