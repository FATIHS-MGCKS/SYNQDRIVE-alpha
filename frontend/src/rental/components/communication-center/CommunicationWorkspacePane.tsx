import { ArrowLeft, PanelRightOpen } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { CommunicationEmptyState } from './CommunicationEmptyState';
import type { CommunicationChannel } from './communication-center.types';

interface CommunicationWorkspacePaneProps {
  selectedConversationId: string | null;
  activeChannel: CommunicationChannel;
  showBack?: boolean;
  showContextAction?: boolean;
  onBack?: () => void;
  onOpenContext?: () => void;
}

function channelLabelKey(channel: CommunicationChannel) {
  if (channel === 'all') return 'communication.channels.all' as const;
  return `communication.channels.${channel}` as const;
}

export function CommunicationWorkspacePane({
  selectedConversationId,
  activeChannel,
  showBack,
  showContextAction,
  onBack,
  onOpenContext,
}: CommunicationWorkspacePaneProps) {
  const { t } = useLanguage();
  const hasSelection = Boolean(selectedConversationId);

  return (
    <div
      data-testid="communication-workspace-pane"
      className="flex h-full min-h-0 flex-col bg-background"
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2.5">
        {showBack && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 lg:hidden"
            onClick={onBack}
            aria-label={t('communication.workspace.backToInbox')}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-foreground">
            {hasSelection
              ? t('communication.workspace.conversationTitle')
              : t('communication.workspace.noSelectionTitle')}
          </h2>
          {hasSelection && (
            <p className="truncate text-[11px] text-muted-foreground">
              {t(channelLabelKey(activeChannel))}
            </p>
          )}
        </div>
        {showContextAction && hasSelection && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 xl:hidden"
            onClick={onOpenContext}
            aria-label={t('communication.context.open')}
          >
            <PanelRightOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            {t('communication.context.title')}
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {hasSelection ? (
          <div
            data-testid="communication-timeline-shell"
            className="flex min-h-full flex-col"
          >
            <div className="min-h-0 flex-1" />
            <div
              className="shrink-0 border-t border-border/30 px-3 py-2"
              aria-hidden
              data-testid="communication-composer-reserved"
            />
          </div>
        ) : (
          <CommunicationEmptyState />
        )}
      </div>
    </div>
  );
}
