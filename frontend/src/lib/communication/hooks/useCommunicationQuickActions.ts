import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import type {
  CommunicationQuickActionAvailability,
  CommunicationQuickActionResult,
} from '../types';
import { communicationConversationSignature } from '../query-keys';
import type { WhatsAppQuickActionId } from '../../api';

export interface UseCommunicationQuickActionsOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  channel?: string | null;
  enabled?: boolean;
  hasExistingDraft?: boolean;
  onComposerPrefill?: (text: string) => void;
  onTemplatePrefill?: (input: {
    templateId: string;
    language: string;
    variables: Record<string, string>;
  }) => void;
  onConversationUpdated?: (result: CommunicationQuickActionResult) => void;
  onRefresh?: () => void | Promise<unknown>;
}

export function useCommunicationQuickActions(options: UseCommunicationQuickActionsOptions) {
  const [actions, setActions] = useState<CommunicationQuickActionAvailability[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<CommunicationQuickActionAvailability | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!options.orgId || !options.conversationId || options.channel !== 'WHATSAPP') {
      setActions([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await communicationClient.getQuickActions(options.orgId, options.conversationId);
      if (requestId !== requestIdRef.current) return;
      setActions(result.actions ?? []);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setActions([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [options.channel, options.conversationId, options.orgId]);

  useEffect(() => {
    if (options.enabled === false) return;
    void reload();
  }, [
    options.enabled,
    reload,
    communicationConversationSignature(options.orgId, options.conversationId),
  ]);

  const applyResult = useCallback(
    (result: CommunicationQuickActionResult) => {
      if (result.actionType === 'COMPOSER_PREFILL' && result.text?.trim()) {
        if (!options.hasExistingDraft) {
          options.onComposerPrefill?.(result.text);
        }
      } else if (result.actionType === 'TEMPLATE_PREFILL' && result.template) {
        options.onTemplatePrefill?.({
          templateId: result.template.templateId,
          language: result.template.language,
          variables: result.template.templateVariables,
        });
      } else if (
        (result.actionType === 'CONVERSATION_MUTATION'
          || result.actionType === 'HANDOFF'
          || (result.actionType === 'BUSINESS_MUTATION' && result.conversation))
        && result.conversation
      ) {
        options.onConversationUpdated?.(result);
      }
      void options.onRefresh?.();
    },
    [
      options.hasExistingDraft,
      options.onComposerPrefill,
      options.onConversationUpdated,
      options.onRefresh,
      options.onTemplatePrefill,
    ],
  );

  const runExecute = useCallback(
    async (actionId: WhatsAppQuickActionId) => {
      if (!options.orgId || !options.conversationId) return;
      setRunningActionId(actionId);
      try {
        const result = await communicationClient.executeQuickAction(
          options.orgId,
          options.conversationId,
          actionId,
        );
        applyResult(result);
        await reload();
      } finally {
        setRunningActionId(null);
        setPendingConfirm(null);
      }
    },
    [applyResult, options.conversationId, options.orgId, reload],
  );

  const execute = useCallback(
    (action: CommunicationQuickActionAvailability) => {
      if (!action.enabled) return;
      if (action.requiresConfirmation) {
        setPendingConfirm(action);
        return;
      }
      void runExecute(action.id);
    },
    [runExecute],
  );

  const confirmPending = useCallback(() => {
    if (!pendingConfirm) return;
    void runExecute(pendingConfirm.id);
  }, [pendingConfirm, runExecute]);

  const cancelPending = useCallback(() => {
    setPendingConfirm(null);
  }, []);

  return {
    actions,
    loading,
    runningActionId,
    pendingConfirm,
    reload,
    execute,
    confirmPending,
    cancelPending,
  };
}
