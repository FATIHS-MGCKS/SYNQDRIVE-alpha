import { useLanguage } from '../../i18n/LanguageContext';
import { CommunicationChannelFilters } from './CommunicationChannelFilters';
import type { CommunicationChannel } from './communication-center.types';

interface CommunicationInboxPaneProps {
  activeChannel: CommunicationChannel;
  onChannelChange: (channel: CommunicationChannel) => void;
}

export function CommunicationInboxPane({
  activeChannel,
  onChannelChange,
}: CommunicationInboxPaneProps) {
  const { t } = useLanguage();

  return (
    <div
      data-testid="communication-inbox-pane"
      className="flex h-full min-h-0 flex-col border-border/40 bg-background"
    >
      <header className="shrink-0 space-y-2.5 border-b border-border/40 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t('communication.inbox.title')}</h2>
          <span
            className="text-[10px] text-muted-foreground"
            aria-hidden
            data-testid="communication-inbox-count-placeholder"
          />
        </div>
        <CommunicationChannelFilters
          activeChannel={activeChannel}
          onChannelChange={onChannelChange}
        />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex h-full min-h-[12rem] items-center justify-center px-4 py-6">
          <p className="text-center text-[12px] text-muted-foreground">
            {t('communication.inbox.emptyList')}
          </p>
        </div>
      </div>
    </div>
  );
}
