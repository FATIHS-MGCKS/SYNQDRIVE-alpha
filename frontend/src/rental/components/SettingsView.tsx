import { useSyncExternalStore } from 'react';

import { useRentalOrg } from '../RentalContext';
import { UsersRolesTab } from './UsersRolesTab';
import { DataAuthorizationTab } from './DataAuthorizationTab';
import { LegalDocumentsTab } from './LegalDocumentsTab';
import { EmailVersandTab } from './settings/email/EmailVersandTab';
import { RentalRulesTab } from './settings/rental-rules/RentalRulesTab';
import { useRentalRulesPermissions } from '../hooks/useRentalRulesPermissions';
import { AccountInformationTab } from './settings/AccountInformationTab';
import { CompanyInformationTab } from './settings/CompanyInformationTab';
import { BillingTab } from './billing/BillingTab';
import { PageHeader, ErrorState } from '../../components/patterns';
import { AdministrationTabBar } from './settings/AdministrationTabBar';
import { AdministrationTabPanel } from './settings/AdministrationTabPanel';
import type { SettingsTab } from './settings/settingsTypes';
import { useLanguage } from '../../i18n/LanguageContext';

function useDocumentDark(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const observer = new MutationObserver(onStoreChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
    () => false,
  );
}

interface SettingsViewProps {
  activeTab?: SettingsTab;
  onTabChange?: (tab: SettingsTab) => void;
  onNavigateToStations?: () => void;
  onCheckBooking?: () => void;
}

export type { SettingsTab } from './settings/settingsTypes';
export { StationsTab } from './stations/StationsTab';

// ============================================
// MAIN SETTINGS VIEW
// ============================================
export function SettingsView({
  activeTab: controlledTab = 'company',
  onTabChange,
  onNavigateToStations,
  onCheckBooking,
}: SettingsViewProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const { t } = useLanguage();
  const activeTab = controlledTab;
  const canWriteDataAuth = hasPermission('data-authorization', 'write');
  const canManageDataAuth = hasPermission('data-authorization', 'manage');
  const rentalRulesPermissions = useRentalRulesPermissions();
  const bridgeDark = useDocumentDark();

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-fade-up">
      <header className="space-y-3">
        <PageHeader title={t('nav.administration')} />
        {onTabChange ? (
          <AdministrationTabBar activeTab={activeTab} onTabChange={onTabChange} />
        ) : null}
      </header>

      {activeTab === 'account' && (
        <AdministrationTabPanel tab="account" activeTab={activeTab}>
          <AccountInformationTab onNavigateToUsers={() => onTabChange?.('users')} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'company' && (
        <AdministrationTabPanel tab="company" activeTab={activeTab}>
          <CompanyInformationTab
            onNavigateToLegalDocuments={() => onTabChange?.('legal-documents')}
            onNavigateToStations={onNavigateToStations}
          />
        </AdministrationTabPanel>
      )}
      {activeTab === 'users' && (
        <AdministrationTabPanel tab="users" activeTab={activeTab}>
          <UsersRolesTab orgId={orgId} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'billing' && (
        <AdministrationTabPanel tab="billing" activeTab={activeTab}>
          <BillingTab />
        </AdministrationTabPanel>
      )}
      {activeTab === 'data-authorization' && (
        <AdministrationTabPanel tab="data-authorization" activeTab={activeTab}>
          <DataAuthorizationTab canWrite={canWriteDataAuth} canManage={canManageDataAuth} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'legal-documents' && (
        <AdministrationTabPanel tab="legal-documents" activeTab={activeTab}>
          <LegalDocumentsTab isDarkMode={bridgeDark} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'email-versand' && (
        <AdministrationTabPanel tab="email-versand" activeTab={activeTab}>
          <EmailVersandTab isDarkMode={bridgeDark} />
        </AdministrationTabPanel>
      )}
      {activeTab === 'rental-rules' && (
        <AdministrationTabPanel tab="rental-rules" activeTab={activeTab}>
          {rentalRulesPermissions.canRead ? (
            <RentalRulesTab onCheckBooking={onCheckBooking} />
          ) : (
            <ErrorState
              title={t('settings.shell.rentalRulesDeniedTitle')}
              description={t('settings.shell.rentalRulesDeniedMessage')}
            />
          )}
        </AdministrationTabPanel>
      )}
    </div>
  );
}
