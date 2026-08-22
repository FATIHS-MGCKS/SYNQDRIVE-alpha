import { ArrowLeft, PanelRightOpen } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { UseCommunicationConversationResult } from '../../../lib/communication/hooks/useCommunicationConversation';
import type { CommunicationClientErrorCode } from '../../../lib/communication/communication-client';
import { resolveConversationTitle } from './communication-inbox-display';
import { CommunicationEmptyState } from './CommunicationEmptyState';
import { CommunicationTimeline } from './CommunicationTimeline';
import { CommunicationDetailSkeleton } from './skeletons/CommunicationDetailSkeleton';
import { CommunicationTimelineSkeleton } from './skeletons/CommunicationTimelineSkeleton';
import type { CommunicationChannel } from './communication-center.types';

interface CommunicationWorkspacePaneProps {
  selectedConversationId: string | null;
  activeChannel: CommunicationChannel;
  conversationState: UseCommunicationConversationResult | null;
  showBack?: boolean;
  showContextAction?: boolean;
  hasContext?: boolean;
  onBack?: () => void;
  onOpenContext?: () => void;
  onClearInvalidSelection?: () => void;
}

function apiChannelLabelKey(channel: string) {
  switch (channel) {
    case 'WHATSAPP':
      return 'communication.channels.whatsapp' as const;
    case 'VOICE':
      return 'communication.channels.voice' as const;
    case 'SMS':
      return 'communication.channels.sms' as const;
    default:
      return 'communication.channels.all' as const;
  }
}

function statusLabelKey(status: string) {
  return `communication.status.${status}` as 'communication.status.AI_ACTIVE';
}

function resolveDetailErrorMessage(
  code: CommunicationClientErrorCode,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  switch (code) {
    case 'permission_denied':
      return t('communication.inbox.errorPermissionDenied');
    case 'network':
      return t('communication.inbox.errorNetwork');
    case 'invalid_query':
      return t('communication.inbox.errorInvalidQuery');
    default:
      return t('communication.inbox.errorUnknown');
  }
}

function resolveTimelineErrorMessage(
  code: CommunicationClientErrorCode,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  if (code === 'permission_denied') {
    return t('communication.inbox.errorPermissionDenied');
  }
  return t('communication.timeline.timelineError');
}

export function CommunicationWorkspacePane({
  selectedConversationId,
  activeChannel,
  conversationState,
  showBack,
  showContextAction,
  hasContext,
  onBack,
  onOpenContext,
  onClearInvalidSelection,
}: CommunicationWorkspacePaneProps) {
  const { t } = useLanguage();
  const hasSelection = Boolean(selectedConversationId);
  const conversation = conversationState?.conversation ?? null;
  const detailLoading = conversationState?.detailLoading ?? false;
  const detailNotFound = conversationState?.detailNotFound ?? false;
  const detailError = conversationState?.detailError ?? null;

  const displayTitle = conversation
    ? resolveConversationTitle(conversation, t)
    : hasSelection
      ? t('communication.workspace.conversationTitle')
      : t('communication.workspace.noSelectionTitle');

  const channel = conversation?.channel;
  const status = conversation?.status;

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
          {detailLoading ? (
            <CommunicationDetailSkeleton compact />
          ) : (
            <>
              <h2
                data-testid="communication-conversation-header-title"
                className="truncate text-[13px] font-semibold text-foreground"
              >
                {displayTitle}
              </h2>
              {hasSelection && conversation && (
                <p
                  data-testid="communication-conversation-header-meta"
                  className="truncate text-[11px] text-muted-foreground"
                >
                  {t(apiChannelLabelKey(conversation.channel))}
                  {status && (
                    <>
                      <span aria-hidden> · </span>
                      {t(statusLabelKey(status))}
                    </>
                  )}
                  {conversation.unreadCount > 0 && (
                    <>
                      <span aria-hidden> · </span>
                      {t('communication.inbox.unreadCount', { count: conversation.unreadCount })}
                    </>
                  )}
                </p>
              )}
              {hasSelection && !conversation && !detailLoading && activeChannel !== 'all' && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {t(`communication.channels.${activeChannel}` as 'communication.channels.whatsapp')}
                </p>
              )}
            </>
          )}
        </div>
        {showContextAction && hasSelection && hasContext && (
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

      <div className="min-h-0 flex-1 overflow-hidden">
        {!hasSelection ? (
          <CommunicationEmptyState />
        ) : detailNotFound ? (
          <div
            data-testid="communication-conversation-not-found"
            className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p className="text-[13px] font-medium text-foreground">
              {t('communication.timeline.notFound')}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onClearInvalidSelection}>
              {t('communication.workspace.backToInbox')}
            </Button>
          </div>
        ) : detailError ? (
          <div
            data-testid="communication-detail-error"
            className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
          >
            <p className="text-[13px] text-muted-foreground">
              {resolveDetailErrorMessage(detailError, t)}
            </p>
            {detailError !== 'permission_denied' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void conversationState?.reloadDetail()}
              >
                {t('communication.timeline.retry')}
              </Button>
            )}
          </div>
        ) : conversationState && conversation ? (
          <CommunicationTimeline
            channel={conversation.channel}
            events={conversationState.events}
            conversationSignature={conversationState.conversationSignature}
            loading={conversationState.timelineLoading}
            error={
              conversationState.timelineError
                ? resolveTimelineErrorMessage(conversationState.timelineError, t)
                : null
            }
            loadingOlder={conversationState.loadingOlder}
            hasMore={conversationState.hasMore}
            paginationError={conversationState.paginationError}
            onRetry={() => void conversationState.reloadTimeline()}
            onLoadOlder={() => void conversationState.loadOlder()}
            onRetryLoadOlder={() => void conversationState.retryLoadOlder()}
          />
        ) : detailLoading ? (
          <CommunicationTimelineSkeleton />
        ) : null}
      </div>

      {hasSelection && conversation && (
        <div
          className="shrink-0 border-t border-border/30 px-3 py-2"
          aria-hidden
          data-testid="communication-composer-reserved"
        />
      )}
    </div>
  );
}
