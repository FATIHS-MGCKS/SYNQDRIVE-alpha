import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationPrimaryTab } from './communication-center.types';

interface CommunicationPrimaryTabsProps {
  activeTab: CommunicationPrimaryTab;
  showSettings: boolean;
  showChannels: boolean;
  showAutomations: boolean;
  onChange: (tab: CommunicationPrimaryTab) => void;
}

export function CommunicationPrimaryTabs({
  activeTab,
  showSettings,
  showChannels,
  showAutomations,
  onChange,
}: CommunicationPrimaryTabsProps) {
  const { t } = useLanguage();

  const tabs: Array<{ key: CommunicationPrimaryTab; label: string; visible: boolean }> = [
    { key: 'inbox', label: t('communication.primary.inbox'), visible: true },
    { key: 'channels', label: t('communication.primary.channels'), visible: showChannels },
    { key: 'ai-activity', label: t('communication.primary.aiActivity'), visible: true },
    { key: 'automations', label: t('communication.primary.automations'), visible: showAutomations },
    { key: 'settings', label: t('communication.primary.settings'), visible: showSettings },
  ];

  return (
    <div
      className="mb-3 flex gap-1 overflow-x-auto border-b border-border/40 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label={t('communication.primary.tabsLabel')}
      data-testid="communication-primary-tabs"
    >
      {tabs
        .filter((tab) => tab.visible)
        .map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            data-testid={`communication-primary-tab-${tab.key}`}
            className={cn(
              'sq-press shrink-0 border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors',
              activeTab === tab.key
                ? 'border-[color:var(--brand)] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => onChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
    </div>
  );
}
