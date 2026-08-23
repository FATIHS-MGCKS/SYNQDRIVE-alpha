import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import type {
  CommunicationVoiceCallDetail,
  CommunicationVoiceCallTranscript,
} from '../types';
import { communicationConversationSignature } from '../query-keys';

export interface UseCommunicationVoiceCallOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  enabled?: boolean;
}

export interface UseCommunicationVoiceCallResult {
  callDetail: CommunicationVoiceCallDetail | null;
  transcript: CommunicationVoiceCallTranscript | null;
  detailLoading: boolean;
  transcriptLoading: boolean;
  transcriptExpanded: boolean;
  creatingTask: boolean;
  detailError: string | null;
  transcriptError: string | null;
  taskError: string | null;
  createdTaskId: string | null;
  setTranscriptExpanded: (expanded: boolean) => void;
  loadTranscript: () => Promise<void>;
  createTask: () => Promise<string | null>;
}

export function useCommunicationVoiceCall({
  orgId,
  conversationId,
  enabled = true,
}: UseCommunicationVoiceCallOptions): UseCommunicationVoiceCallResult {
  const [callDetail, setCallDetail] = useState<CommunicationVoiceCallDetail | null>(null);
  const [transcript, setTranscript] = useState<CommunicationVoiceCallTranscript | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string | null>(null);
  const signature = communicationConversationSignature(orgId, conversationId);

  useEffect(() => {
    setCallDetail(null);
    setTranscript(null);
    setTranscriptExpanded(false);
    setDetailError(null);
    setTranscriptError(null);
    setTaskError(null);
    setCreatedTaskId(null);
    idempotencyKeyRef.current = null;
  }, [signature]);

  useEffect(() => {
    if (!enabled || !orgId || !conversationId) {
      setCallDetail(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    const requestSignature = signature;
    setDetailLoading(true);
    setDetailError(null);

    void communicationClient
      .getVoiceCallDetail(orgId, conversationId)
      .then((detail) => {
        if (cancelled || requestSignature !== communicationConversationSignature(orgId, conversationId)) {
          return;
        }
        setCallDetail(detail);
      })
      .catch(() => {
        if (cancelled || requestSignature !== communicationConversationSignature(orgId, conversationId)) {
          return;
        }
        setDetailError('load_failed');
        setCallDetail(null);
      })
      .finally(() => {
        if (!cancelled && requestSignature === communicationConversationSignature(orgId, conversationId)) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, enabled, orgId, signature]);

  const loadTranscript = useCallback(async () => {
    if (!orgId || !conversationId) return;
    const requestSignature = signature;
    setTranscriptLoading(true);
    setTranscriptError(null);
    try {
      const result = await communicationClient.getVoiceCallTranscript(orgId, conversationId);
      if (requestSignature !== communicationConversationSignature(orgId, conversationId)) return;
      setTranscript(result);
    } catch {
      if (requestSignature !== communicationConversationSignature(orgId, conversationId)) return;
      setTranscriptError('load_failed');
      setTranscript(null);
    } finally {
      if (requestSignature === communicationConversationSignature(orgId, conversationId)) {
        setTranscriptLoading(false);
      }
    }
  }, [conversationId, orgId, signature]);

  useEffect(() => {
    if (!transcriptExpanded) return;
    if (transcript || transcriptLoading) return;
    void loadTranscript();
  }, [loadTranscript, transcript, transcriptExpanded, transcriptLoading]);

  const createTask = useCallback(async (): Promise<string | null> => {
    if (!orgId || !conversationId || creatingTask) return null;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const requestSignature = signature;
    setCreatingTask(true);
    setTaskError(null);
    try {
      const result = await communicationClient.createVoiceCallTask(orgId, conversationId, {
        idempotencyKey: idempotencyKeyRef.current,
        title: callDetail?.summary
          ? `Follow-up: ${callDetail.summary.slice(0, 80)}`
          : undefined,
      });
      if (requestSignature !== communicationConversationSignature(orgId, conversationId)) {
        return result.taskId;
      }
      setCreatedTaskId(result.taskId);
      return result.taskId;
    } catch {
      if (requestSignature === communicationConversationSignature(orgId, conversationId)) {
        setTaskError('create_failed');
      }
      return null;
    } finally {
      if (requestSignature === communicationConversationSignature(orgId, conversationId)) {
        setCreatingTask(false);
      }
    }
  }, [callDetail?.summary, conversationId, creatingTask, orgId, signature]);

  return {
    callDetail,
    transcript,
    detailLoading,
    transcriptLoading,
    transcriptExpanded,
    creatingTask,
    detailError,
    transcriptError,
    taskError,
    createdTaskId,
    setTranscriptExpanded,
    loadTranscript,
    createTask,
  };
}
