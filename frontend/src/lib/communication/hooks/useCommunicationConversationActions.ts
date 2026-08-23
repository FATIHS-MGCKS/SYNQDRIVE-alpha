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
  | 'assign'
  | 'unassign'
  | 'resolve'
  | 'reopen'
  | 'markRead';

export interface UseCommunicationConversationActionsOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  onConversationUpdated?: (conversation: CommunicationConversationDetail) => void;
  onTimelineRefresh?: () => void | Promise<unknown>;
  onInboxRefresh?: () => void | Promise<unknown>;
  onConflictRefresh?: () => void | Promise<unknown>;
}

export interface UseCommunicationConversationActionsResult {
  pendingAction: CommunicationConversationMutation | null;
  actionError: CommunicationClientErrorCode | null;
  claim: () => Promise<CommunicationConversationDetail | null>;
  assign: (assignedUserId: string) => Promise<CommunicationConversationDetail | null>;
  unassign: () => Promise<CommunicationConversationDetail | null>;
  takeOverSelf: () => Promise<CommunicationConversationDetail | null>;
  resolve: () => Promise<CommunicationConversationDetail | null>;
  reopen: () => Promise<CommunicationConversationDetail | null>;
  markRead: () => Promise<CommunicationConversationDetail | null>;
  clearActionError: () => void;
}

function isConflictError(err: unknown): boolean {
  if (!(err instanceof CommunicationClientError)) return false;
  if (err.status === 409) return true;
  return (
    err.message.includes('ALREADY_CLAIMED')
    || err.message.includes('STALE_STATE')
    || err.message.includes('CONFLICT')
  );
}

export function useCommunicationConversationActions({
  orgId,
  conversationId,
  onConversationUpdated,
  onTimelineRefresh,
  onInboxRefresh,
  onConflictRefresh,
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
        onConversationUpdated?.(response.conversation);
        if (action === 'claim' || action === 'assign' || action === 'unassign' || action === 'resolve' || action === 'reopen') {
          await onTimelineRefresh?.();
        }
        await onInboxRefresh?.();
        return response.conversation;
      } catch (err) {
        if (communicationConversationSignature(orgId, conversationId) !== requestSignature) {
          return null;
        }
        if (isConflictError(err)) {
          setActionError(
            err instanceof CommunicationClientError
              ? err.code === 'stale_state'
                ? 'stale_state'
                : 'already_claimed'
              : 'unknown',
          );
          await onConflictRefresh?.();
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
    [
      conversationId,
      onConflictRefresh,
      onConversationUpdated,
      onInboxRefresh,
      onTimelineRefresh,
      orgId,
    ],
  );

  const assign = useCallback(
    (assignedUserId: string) =>
      runMutation('assign', () =>
        communicationClient.assignConversation(orgId!, conversationId!, assignedUserId),
      ),
    [conversationId, orgId, runMutation],
  );

  const unassign = useCallback(
    () =>
      runMutation('unassign', () =>
        communicationClient.assignConversation(orgId!, conversationId!, null),
      ),
    [conversationId, orgId, runMutation],
  );

  const takeOverSelf = useCallback(
    () => runMutation('claim', () => communicationClient.claimConversation(orgId!, conversationId!)),
    [conversationId, orgId, runMutation],
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
    assign,
    unassign,
    takeOverSelf,
    resolve,
    reopen,
    markRead,
    clearActionError: () => setActionError(null),
  };
}
