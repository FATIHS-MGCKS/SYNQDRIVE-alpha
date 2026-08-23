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
  getAttachment?: () => { id: string; mediaType: 'IMAGE' | 'DOCUMENT' } | null;
  onAttachmentCleared?: () => void;
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

function mapReplyError(err: unknown): {
  code: CommunicationClientErrorCode;
  message: string;
  preserveIdempotencyKey: boolean;
  resetIdempotencyKey: boolean;
} {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('SEND_UNKNOWN') || message.includes('Delivery status is being confirmed')) {
    return {
      code: 'unknown',
      message: 'Delivery status is being confirmed',
      preserveIdempotencyKey: true,
      resetIdempotencyKey: false,
    };
  }

  if (!(err instanceof CommunicationClientError)) {
    return {
      code: 'unknown',
      message: 'Could not send message',
      preserveIdempotencyKey: false,
      resetIdempotencyKey: true,
    };
  }
  if (message.includes('CHANNEL_NOT_CONFIGURED')) {
    return {
      code: 'unknown',
      message: 'SMS sending is not configured',
      preserveIdempotencyKey: false,
      resetIdempotencyKey: true,
    };
  }
  if (message.includes('CHANNEL_NOT_REPLYABLE')) {
    return {
      code: 'unknown',
      message: 'This channel does not support text replies',
      preserveIdempotencyKey: false,
      resetIdempotencyKey: true,
    };
  }
  if (message.includes('ALREADY_CLAIMED')) {
    return {
      code: 'already_claimed',
      message: 'Conversation was claimed by another user',
      preserveIdempotencyKey: false,
      resetIdempotencyKey: true,
    };
  }
  if (message.includes('MESSAGE_TOO_LONG')) {
    return {
      code: 'invalid_query',
      message: 'Message is too long',
      preserveIdempotencyKey: false,
      resetIdempotencyKey: true,
    };
  }
  if (message.includes('SEND_FAILED') || message.includes('Could not send')) {
    return {
      code: 'unknown',
      message: 'Could not send message',
      preserveIdempotencyKey: false,
      resetIdempotencyKey: true,
    };
  }
  return {
    code: err.code,
    message: 'Could not send message',
    preserveIdempotencyKey: false,
    resetIdempotencyKey: true,
  };
}

export function useCommunicationReply({
  orgId,
  conversationId,
  onConversationUpdated,
  onTimelineRefresh,
  onInboxRefresh,
  onConflictRefresh,
  getAttachment,
  onAttachmentCleared,
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
    const attachment = getAttachment?.() ?? null;
    if (!attachment && !trimmed) return null;
    if (attachment && getAttachment && !getAttachment()) return null;

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
        text: trimmed || undefined,
        attachmentId: attachment?.id,
        contentType: attachment ? attachment.mediaType : 'TEXT',
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (activeSignatureRef.current !== requestSignature) {
        return null;
      }

      if (response.sendState !== 'ACCEPTED') {
        if (response.sendState === 'UNKNOWN' || response.sendState === 'PENDING') {
          setSendError('unknown');
          setSendErrorMessage('Delivery status is being confirmed');
        } else {
          setSendError('unknown');
          setSendErrorMessage('Could not send message');
          idempotencyKeyRef.current = null;
        }
        return null;
      }

      setDraft('');
      if (conversationKey) {
        draftByConversationRef.current.delete(conversationKey);
      }
      idempotencyKeyRef.current = null;
      onAttachmentCleared?.();

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
      if (!mapped.preserveIdempotencyKey && mapped.resetIdempotencyKey) {
        idempotencyKeyRef.current = null;
      }
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
    getAttachment,
    onAttachmentCleared,
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
