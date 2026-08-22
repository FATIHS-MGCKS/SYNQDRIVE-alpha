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
      <header className="shrink-0 space-y-2 border-b border-border/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t('communication.inbox.title')}</h2>
          <span
            className="sr-only"
            data-testid="communication-inbox-count-placeholder"
          >
            {t('communication.inbox.countReserved')}
          </span>
        </div>
        <CommunicationChannelFilters
          activeChannel={activeChannel}
          onChannelChange={onChannelChange}
        />
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid="communication-inbox-list-shell"
        aria-label={t('communication.inbox.listShell')}
      />
    </div>
  );
}
