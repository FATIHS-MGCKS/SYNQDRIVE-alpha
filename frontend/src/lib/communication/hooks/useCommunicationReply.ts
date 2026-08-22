import { useCallback, useEffect, useRef, useState } from 'react';
import {
  communicationClient,
  CommunicationClientError,
  type CommunicationClientErrorCode,
} from '../communication-client';
import { communicationConversationSignature } from '../query-keys';
import type { CommunicationConversationDetail } from '../types';

export interface UseCommunicationReplyOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  onConversationUpdated?: (conversation: CommunicationConversationDetail) => void;
  onTimelineRefresh?: () => void | Promise<unknown>;
  onInboxRefresh?: () => void | Promise<unknown>;
  onConflictRefresh?: () => void | Promise<unknown>;
}

export interface UseCommunicationReplyResult {
  draft: string;
  setDraft: (value: string) => void;
  sending: boolean;
  sendError: CommunicationClientErrorCode | null;
  sendErrorMessage: string | null;
  send: () => Promise<CommunicationConversationDetail | null>;
  clearSendError: () => void;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function mapReplyError(err: unknown): { code: CommunicationClientErrorCode; message: string } {
  if (!(err instanceof CommunicationClientError)) {
    return { code: 'unknown', message: 'Could not send message' };
  }
  const message = err.message;
  if (message.includes('CHANNEL_NOT_CONFIGURED')) {
    return { code: 'unknown', message: 'SMS sending is not configured' };
  }
  if (message.includes('CHANNEL_NOT_REPLYABLE')) {
    return { code: 'unknown', message: 'This channel does not support text replies' };
  }
  if (message.includes('ALREADY_CLAIMED')) {
    return { code: 'already_claimed', message: 'Conversation was claimed by another user' };
  }
  if (message.includes('SEND_UNKNOWN') || message.includes('Delivery status is being confirmed')) {
    return { code: 'unknown', message: 'Delivery status is being confirmed' };
  }
  if (message.includes('MESSAGE_TOO_LONG')) {
    return { code: 'invalid_query', message: 'Message is too long' };
  }
  if (message.includes('SEND_FAILED') || message.includes('Could not send')) {
    return { code: 'unknown', message: 'Could not send message' };
  }
  return { code: err.code, message: 'Could not send message' };
}

export function useCommunicationReply({
  orgId,
  conversationId,
  onConversationUpdated,
  onTimelineRefresh,
  onInboxRefresh,
  onConflictRefresh,
}: UseCommunicationReplyOptions): UseCommunicationReplyResult {
  const [draft, setDraftState] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<CommunicationClientErrorCode | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null);
  const inflightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const draftByConversationRef = useRef<Map<string, string>>(new Map());
  const lastOrgIdRef = useRef<string | null>(null);
  const activeSignatureRef = useRef<string | null>(null);

  const conversationKey =
    orgId && conversationId ? communicationConversationSignature(orgId, conversationId) : null;

  useEffect(() => {
    activeSignatureRef.current = conversationKey;
  }, [conversationKey]);

  useEffect(() => {
    if (!orgId) return;
    if (lastOrgIdRef.current && lastOrgIdRef.current !== orgId) {
      draftByConversationRef.current.clear();
      idempotencyKeyRef.current = null;
      setDraftState('');
    }
    lastOrgIdRef.current = orgId;
  }, [orgId]);

  useEffect(() => {
    if (!conversationKey) {
      setDraftState('');
      return;
    }
    setDraftState(draftByConversationRef.current.get(conversationKey) ?? '');
    idempotencyKeyRef.current = null;
    setSendError(null);
    setSendErrorMessage(null);
  }, [conversationKey]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (conversationKey) {
        draftByConversationRef.current.set(conversationKey, value);
      }
    },
    [conversationKey],
  );

  const send = useCallback(async (): Promise<CommunicationConversationDetail | null> => {
    if (!orgId || !conversationId || inflightRef.current) return null;
    const trimmed = draft.trim();
    if (!trimmed) return null;

    const requestSignature = communicationConversationSignature(orgId, conversationId);
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = createIdempotencyKey();
    }

    inflightRef.current = true;
    setSending(true);
    setSendError(null);
    setSendErrorMessage(null);

    try {
      const response = await communicationClient.replyConversation(orgId, conversationId, {
        text: trimmed,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (activeSignatureRef.current !== requestSignature) {
        return null;
      }

      if (response.sendState === 'ACCEPTED') {
        setDraft('');
        if (conversationKey) {
          draftByConversationRef.current.delete(conversationKey);
        }
        idempotencyKeyRef.current = null;
      }

      onConversationUpdated?.(response.conversation);
      await onTimelineRefresh?.();
      await onInboxRefresh?.();
      return response.conversation;
    } catch (err) {
      if (activeSignatureRef.current !== requestSignature) {
        return null;
      }
      const mapped = mapReplyError(err);
      setSendError(mapped.code);
      setSendErrorMessage(mapped.message);
      if (mapped.code === 'already_claimed') {
        await onConflictRefresh?.();
      }
      return null;
    } finally {
      inflightRef.current = false;
      setSending(false);
    }
  }, [
    conversationId,
    conversationKey,
    draft,
    onConflictRefresh,
    onConversationUpdated,
    onInboxRefresh,
    onTimelineRefresh,
    orgId,
    setDraft,
  ]);

  return {
    draft,
    setDraft,
    sending,
    sendError,
    sendErrorMessage,
    send,
    clearSendError: () => {
      setSendError(null);
      setSendErrorMessage(null);
    },
  };
}
