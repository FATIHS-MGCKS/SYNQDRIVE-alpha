import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationPrimaryTab } from './communication-center.types';

interface CommunicationCenterTabsProps {
  activeTab: CommunicationPrimaryTab;
  onTabChange: (tab: CommunicationPrimaryTab) => void;
  inboxContent: ReactNode;
  settingsContent: ReactNode;
}

export function CommunicationCenterTabs({
  activeTab,
  onTabChange,
  inboxContent,
  settingsContent,
}: CommunicationCenterTabsProps) {
  const { t } = useLanguage();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as CommunicationPrimaryTab)}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      <TabsList aria-label={t('communication.tabs.ariaLabel')}>
        <TabsTrigger value="inbox">{t('communication.tabs.inbox')}</TabsTrigger>
        <TabsTrigger value="settings">{t('communication.tabs.settings')}</TabsTrigger>
      </TabsList>
      <TabsContent value="inbox" className="mt-0 flex min-h-0 flex-1 flex-col">
        {inboxContent}
      </TabsContent>
      <TabsContent value="settings" className="mt-0 flex min-h-0 flex-1 flex-col">
        {settingsContent}
      </TabsContent>
    </Tabs>
  );
}
