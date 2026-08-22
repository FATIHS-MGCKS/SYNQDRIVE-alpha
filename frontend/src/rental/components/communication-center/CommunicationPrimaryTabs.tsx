import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationPrimaryTab } from './communication-center.types';

interface CommunicationPrimaryTabsProps {
  activeTab: CommunicationPrimaryTab;
  showSettings: boolean;
  onChange: (tab: CommunicationPrimaryTab) => void;
}

export function CommunicationPrimaryTabs({
  activeTab,
  showSettings,
  onChange,
}: CommunicationPrimaryTabsProps) {
  const { t } = useLanguage();

  return (
    <div
      className="mb-3 flex gap-1 border-b border-border/40"
      role="tablist"
      aria-label={t('communication.primary.tabsLabel')}
      data-testid="communication-primary-tabs"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'inbox'}
        data-testid="communication-primary-tab-inbox"
        className={cn(
          'sq-press border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors',
          activeTab === 'inbox'
            ? 'border-[color:var(--brand)] text-foreground'
            : 'border-transparent text-muted-foreground hover:text-foreground',
        )}
        onClick={() => onChange('inbox')}
      >
        {t('communication.primary.inbox')}
      </button>
      {showSettings && (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'settings'}
          data-testid="communication-primary-tab-settings"
          className={cn(
            'sq-press border-b-2 px-3 py-2 text-[11px] font-semibold transition-colors',
            activeTab === 'settings'
              ? 'border-[color:var(--brand)] text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange('settings')}
        >
          {t('communication.primary.settings')}
        </button>
      )}
    </div>
  );
}
