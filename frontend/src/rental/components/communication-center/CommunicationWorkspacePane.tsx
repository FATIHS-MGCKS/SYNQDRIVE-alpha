import { ArrowLeft, MoreHorizontal, PanelRightOpen } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { useLanguage } from '../../i18n/LanguageContext';
import type { UseCommunicationConversationResult } from '../../../lib/communication/hooks/useCommunicationConversation';
import type { UseCommunicationConversationActionsResult } from '../../../lib/communication/hooks/useCommunicationConversationActions';
import type { UseCommunicationReplyResult } from '../../../lib/communication/hooks/useCommunicationReply';
import type { UseCommunicationAttachmentDraftResult } from '../../../lib/communication/hooks/useCommunicationAttachmentDraft';
import type { UseCommunicationOrgMembersResult } from '../../../lib/communication/hooks/useCommunicationOrgMembers';
import { resolveCommunicationComposerState } from '../../../lib/communication/communication-composer-capability';
import { resolveCommunicationHumanActions } from '../../../lib/communication/communication-human-actions';
import { CommunicationComposer } from './CommunicationComposer';
import { CommunicationAiSuggestionButton, CommunicationQuickActions } from './CommunicationComposerActions';
import { CommunicationTemplatePicker } from './CommunicationTemplatePicker';
import { useCommunicationComposerCapability } from '../../../lib/communication/hooks/useCommunicationComposerCapability';
import { useCommunicationAiSuggestion } from '../../../lib/communication/hooks/useCommunicationAiSuggestion';
import { useCommunicationQuickActions } from '../../../lib/communication/hooks/useCommunicationQuickActions';
import { useCommunicationSendableTemplates } from '../../../lib/communication/hooks/useCommunicationSendableTemplates';
import { CommunicationAssigneeControl } from './CommunicationAssigneeControl';
import { resolveCommunicationConversationActions } from '../../../lib/communication/communication-actions';
import type { CommunicationClientErrorCode } from '../../../lib/communication/communication-client';
import { resolveConversationTitle } from './communication-inbox-display';
import { CommunicationEmptyState } from './CommunicationEmptyState';
import { CommunicationTimeline } from './CommunicationTimeline';
import { CommunicationDetailSkeleton } from './skeletons/CommunicationDetailSkeleton';
import { CommunicationTimelineSkeleton } from './skeletons/CommunicationTimelineSkeleton';
import type { CommunicationChannel } from './communication-center.types';

interface CommunicationWorkspacePaneProps {
  orgId: string | null;
  selectedConversationId: string | null;
  activeChannel: CommunicationChannel;
  conversationState: UseCommunicationConversationResult | null;
  conversationActions?: UseCommunicationConversationActionsResult | null;
  replyState?: UseCommunicationReplyResult | null;
  attachmentDraftState?: UseCommunicationAttachmentDraftResult | null;
  mediaReplyEnabled?: boolean;
  orgMembers?: UseCommunicationOrgMembersResult | null;
  canWrite?: boolean;
  canManage?: boolean;
  currentUserId?: string | null;
  membersDirectoryAvailable?: boolean;
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

function resolveActionErrorMessage(
  code: CommunicationClientErrorCode,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  switch (code) {
    case 'already_claimed':
      return t('communication.actions.errorAlreadyClaimed');
    case 'stale_state':
      return t('communication.actions.errorStaleState');
    case 'permission_denied':
      return t('communication.actions.errorForbidden');
    case 'invalid_query':
      return t('communication.actions.errorInvalidTransition');
    default:
      return t('communication.actions.errorUpdateFailed');
  }
}

export function CommunicationWorkspacePane({
  orgId,
  selectedConversationId,
  activeChannel,
  conversationState,
  conversationActions,
  replyState,
  attachmentDraftState,
  mediaReplyEnabled = false,
  orgMembers,
  canWrite = false,
  canManage = false,
  currentUserId = null,
  membersDirectoryAvailable = true,
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

  const humanActions = resolveCommunicationHumanActions({
    conversation,
    canWrite,
    canManage,
    currentUserId,
    membersDirectoryAvailable,
  });

  const lifecycleActions = resolveCommunicationConversationActions({
    conversation,
    canWrite,
  });
  const primaryLifecycleAction = lifecycleActions.find((action) => action === 'resolve' || action === 'reopen') ?? null;
  const overflowActions = lifecycleActions.filter((action) => action !== primaryLifecycleAction);
  const pendingAction = conversationActions?.pendingAction ?? null;
  const actionError = conversationActions?.actionError ?? null;

  const displayTitle = conversation
    ? resolveConversationTitle(conversation, t)
    : hasSelection
      ? t('communication.workspace.conversationTitle')
      : t('communication.workspace.noSelectionTitle');

  const channel = conversation?.channel;
  const status = conversation?.status;

  const runLifecycleAction = (action: 'resolve' | 'reopen' | 'markRead') => {
    if (!conversationActions) return;
    switch (action) {
      case 'resolve':
        void conversationActions.resolve();
        break;
      case 'reopen':
        void conversationActions.reopen();
        break;
      case 'markRead':
        void conversationActions.markRead();
        break;
      default:
        break;
    }
  };

  const lifecycleActionLabel = (action: 'resolve' | 'reopen' | 'markRead', loading: boolean) => {
    switch (action) {
      case 'resolve':
        return loading ? t('communication.actions.resolving') : t('communication.actions.resolve');
      case 'reopen':
        return loading ? t('communication.actions.reopening') : t('communication.actions.reopen');
      case 'markRead':
        return loading ? t('communication.actions.markingRead') : t('communication.actions.markRead');
      default:
        return '';
    }
  };

  const composerState = resolveCommunicationComposerState({
    canWrite,
    conversation,
    currentUserId,
  });

  const composerCapability = useCommunicationComposerCapability({
    orgId,
    conversationId: selectedConversationId,
    channel: conversation?.channel,
    enabled: composerState.mode === 'enabled',
  });

  const aiSuggestion = useCommunicationAiSuggestion({
    orgId,
    conversationId: selectedConversationId,
    enabled:
      composerState.mode === 'enabled'
      && composerCapability.replyMode === 'FREEFORM_TEXT_ALLOWED',
    hasExistingDraft: Boolean(replyState?.draft.trim()),
    onApplySuggestion: replyState?.setDraft,
  });

  const quickActions = useCommunicationQuickActions({
    orgId,
    conversationId: selectedConversationId,
    channel: conversation?.channel,
    enabled: canWrite,
  });

  const templatePickerOpen = composerCapability.replyMode === 'TEMPLATE_REQUIRED';
  const sendableTemplates = useCommunicationSendableTemplates({
    orgId,
    conversationId: selectedConversationId,
    channel: conversation?.channel,
    open: templatePickerOpen,
  });

  const showAiSuggestion =
    composerState.mode === 'enabled'
    && composerCapability.replyMode === 'FREEFORM_TEXT_ALLOWED'
    && conversation?.channel === 'WHATSAPP';

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
              {actionError && (
                <p
                  role="alert"
                  data-testid="communication-action-error"
                  className="mt-1 text-[11px] text-destructive"
                >
                  {resolveActionErrorMessage(actionError, t)}
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

        {canWrite && conversation && conversationActions && (
          <CommunicationAssigneeControl
            humanActions={humanActions}
            currentUserId={currentUserId}
            pendingAction={pendingAction}
            disabled={pendingAction != null}
            members={orgMembers?.members ?? []}
            membersLoading={orgMembers?.loading ?? false}
            membersLoadError={orgMembers?.loadError ?? null}
            selectedUserId={conversation.assignedUser?.id ?? null}
            onEnsureMembersLoaded={() => void orgMembers?.ensureLoaded()}
            onClaim={() => void conversationActions.claim()}
            onTakeOverSelf={() => void conversationActions.takeOverSelf()}
            onAssign={(userId) => void conversationActions.assign(userId)}
            onUnassign={() => void conversationActions.unassign()}
          />
        )}

        {canWrite && primaryLifecycleAction && conversationActions && (
          <div className="flex shrink-0 items-center gap-1" data-testid="communication-header-actions">
            <Button
              type="button"
              size="sm"
              variant={primaryLifecycleAction === 'reopen' ? 'outline' : 'default'}
              className="h-8"
              disabled={pendingAction != null}
              aria-busy={pendingAction === primaryLifecycleAction}
              onClick={() => runLifecycleAction(primaryLifecycleAction)}
            >
              {lifecycleActionLabel(primaryLifecycleAction, pendingAction === primaryLifecycleAction)}
            </Button>
            {overflowActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    aria-label={t('communication.actions.more')}
                    disabled={pendingAction != null}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {overflowActions.map((action) => (
                    <DropdownMenuItem
                      key={action}
                      onSelect={() => runLifecycleAction(action)}
                      disabled={pendingAction != null}
                    >
                      {lifecycleActionLabel(action, pendingAction === action)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}

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
            orgId={orgId ?? ''}
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

      {hasSelection && conversation && replyState ? (
        <CommunicationComposer
          state={composerState}
          draft={replyState.draft}
          sending={replyState.sending}
          errorMessage={
            aiSuggestion.error
              ? t('communication.aiSuggestion.error')
              : replyState.sendErrorMessage
          }
          mediaEnabled={mediaReplyEnabled && composerCapability.replyMode === 'FREEFORM_TEXT_ALLOWED'}
          attachmentDraft={attachmentDraftState?.draft}
          replyMode={
            composerCapability.replyMode === 'CHANNEL_NOT_REPLYABLE'
              ? 'FREEFORM_TEXT_ALLOWED'
              : composerCapability.replyMode
          }
          composerActions={
            <>
              {showAiSuggestion ? (
                <CommunicationAiSuggestionButton
                  loading={aiSuggestion.loading}
                  disabled={aiSuggestion.loading}
                  onClick={() => void aiSuggestion.generate()}
                />
              ) : null}
              <CommunicationQuickActions
                context={quickActions.context}
                loading={quickActions.loading}
                runningActionId={quickActions.runningActionId}
                onExecute={(actionId, requiresConfirm) =>
                  void quickActions.execute(actionId, requiresConfirm)
                }
              />
            </>
          }
          templateSection={
            templatePickerOpen ? (
              <CommunicationTemplatePicker
                templates={sendableTemplates.items}
                loading={sendableTemplates.loading}
                sending={replyState.sending}
                onSend={(input) => void replyState.sendTemplate(input)}
              />
            ) : null
          }
          onDraftChange={replyState.setDraft}
          onSend={() => void replyState.send()}
          onSelectFile={attachmentDraftState?.selectFile}
          onRemoveAttachment={attachmentDraftState?.removeAttachment}
        />
      ) : null}
    </div>
  );
}
