import { useCallback, useRef, useState } from 'react';
import {
  communicationClient,
  CommunicationClientError,
  type CommunicationClientErrorCode,
} from '../communication-client';
import { communicationConversationSignature } from '../query-keys';
import type { CommunicationConversationDetail } from '../types';

export type CommunicationConversationMutation =
  | 'claim'
  | 'resolve'
  | 'reopen'
  | 'markRead';

export interface UseCommunicationConversationActionsOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  onRefreshDetail?: () => Promise<unknown>;
  onTimelineRefresh?: () => void | Promise<unknown>;
  onInboxRefresh?: () => void | Promise<unknown>;
}

export interface UseCommunicationConversationActionsResult {
  pendingAction: CommunicationConversationMutation | null;
  actionError: CommunicationClientErrorCode | null;
  claim: () => Promise<CommunicationConversationDetail | null>;
  resolve: () => Promise<CommunicationConversationDetail | null>;
  reopen: () => Promise<CommunicationConversationDetail | null>;
  markRead: () => Promise<CommunicationConversationDetail | null>;
  clearActionError: () => void;
}

function isAlreadyClaimed(err: unknown): boolean {
  if (!(err instanceof CommunicationClientError)) return false;
  if (err.status === 409) return true;
  return err.message.includes('ALREADY_CLAIMED');
}

export function useCommunicationConversationActions({
  orgId,
  conversationId,
  onRefreshDetail,
  onTimelineRefresh,
  onInboxRefresh,
}: UseCommunicationConversationActionsOptions): UseCommunicationConversationActionsResult {
  const [pendingAction, setPendingAction] = useState<CommunicationConversationMutation | null>(null);
  const [actionError, setActionError] = useState<CommunicationClientErrorCode | null>(null);
  const inflightRef = useRef<CommunicationConversationMutation | null>(null);

  const runMutation = useCallback(
    async (
      action: CommunicationConversationMutation,
      fn: () => Promise<{ conversation: CommunicationConversationDetail }>,
    ): Promise<CommunicationConversationDetail | null> => {
      if (!orgId || !conversationId) return null;
      if (inflightRef.current) return null;

      const requestSignature = communicationConversationSignature(orgId, conversationId);
      inflightRef.current = action;
      setPendingAction(action);
      setActionError(null);

      try {
        const response = await fn();
        if (communicationConversationSignature(orgId, conversationId) !== requestSignature) {
          return null;
        }
        await onRefreshDetail?.();
        if (action === 'claim' || action === 'resolve' || action === 'reopen') {
          await onTimelineRefresh?.();
        }
        await onInboxRefresh?.();
        return response.conversation;
      } catch (err) {
        if (communicationConversationSignature(orgId, conversationId) !== requestSignature) {
          return null;
        }
        if (isAlreadyClaimed(err)) {
          setActionError('already_claimed');
          await onRefreshDetail?.();
        } else {
          setActionError(err instanceof CommunicationClientError ? err.code : 'unknown');
        }
        return null;
      } finally {
        if (inflightRef.current === action) {
          inflightRef.current = null;
          setPendingAction(null);
        }
      }
    },
    [conversationId, onInboxRefresh, onRefreshDetail, onTimelineRefresh, orgId],
  );

  const claim = useCallback(
    () => runMutation('claim', () => communicationClient.claimConversation(orgId!, conversationId!)),
    [conversationId, orgId, runMutation],
  );

  const resolve = useCallback(
    () => runMutation('resolve', () => communicationClient.resolveConversation(orgId!, conversationId!)),
    [conversationId, orgId, runMutation],
  );

  const reopen = useCallback(
    () => runMutation('reopen', () => communicationClient.reopenConversation(orgId!, conversationId!)),
    [conversationId, orgId, runMutation],
  );

  const markRead = useCallback(
    () => runMutation('markRead', () => communicationClient.markConversationRead(orgId!, conversationId!)),
    [conversationId, orgId, runMutation],
  );

  return {
    pendingAction,
    actionError,
    claim,
    resolve,
    reopen,
    markRead,
    clearActionError: () => setActionError(null),
  };
}
