import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import { communicationConversationSignature } from '../query-keys';
import type { CommunicationAttachmentDto } from '../types';

export type CommunicationAttachmentDraftState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string }
  | { status: 'ready'; attachment: CommunicationAttachmentDto; previewUrl?: string | null }
  | { status: 'error'; fileName: string; code: 'permission_denied' | 'unsupported' | 'too_large' | 'network' | 'unknown' };

export interface UseCommunicationAttachmentDraftOptions {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  enabled?: boolean;
}

export interface UseCommunicationAttachmentDraftResult {
  draft: CommunicationAttachmentDraftState;
  selectFile: (file: File) => void;
  removeAttachment: () => void;
  canSendWithAttachment: boolean;
}

function mapUploadError(
  err: unknown,
): Extract<CommunicationAttachmentDraftState, { status: 'error' }> {
  const status = (err as { status?: number })?.status;
  const message = err instanceof Error ? err.message : String(err);
  if (status === 403 || status === 401) {
    return { status: 'error', fileName: '', code: 'permission_denied' };
  }
  if (message.includes('UNSUPPORTED_MEDIA_TYPE') || message.includes('Unsupported')) {
    return { status: 'error', fileName: '', code: 'unsupported' };
  }
  if (message.includes('FILE_TOO_LARGE')) {
    return { status: 'error', fileName: '', code: 'too_large' };
  }
  if (message.toLowerCase().includes('network')) {
    return { status: 'error', fileName: '', code: 'network' };
  }
  return { status: 'error', fileName: '', code: 'unknown' };
}

export function useCommunicationAttachmentDraft({
  orgId,
  conversationId,
  enabled = true,
}: UseCommunicationAttachmentDraftOptions): UseCommunicationAttachmentDraftResult {
  const [draft, setDraft] = useState<CommunicationAttachmentDraftState>({ status: 'idle' });
  const previewUrlRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const signature =
    orgId && conversationId ? communicationConversationSignature(orgId, conversationId) : null;

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    requestGenerationRef.current += 1;
    revokePreview();
    setDraft({ status: 'idle' });
  }, [signature, revokePreview]);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const removeAttachment = useCallback(() => {
    revokePreview();
    setDraft({ status: 'idle' });
  }, [revokePreview]);

  const selectFile = useCallback(
    (file: File) => {
      if (!enabled || !orgId || !conversationId) return;

      const requestSignature = communicationConversationSignature(orgId, conversationId);
      const generation = requestGenerationRef.current + 1;
      requestGenerationRef.current = generation;

      revokePreview();
      setDraft({ status: 'uploading', fileName: file.name });

      const localPreview =
        file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      previewUrlRef.current = localPreview;

      void communicationClient
        .uploadAttachment(orgId, conversationId, file)
        .then((attachment) => {
          if (
            requestGenerationRef.current !== generation
            || communicationConversationSignature(orgId, conversationId) !== requestSignature
          ) {
            return;
          }
          setDraft({
            status: 'ready',
            attachment,
            previewUrl: localPreview,
          });
        })
        .catch((err) => {
          if (
            requestGenerationRef.current !== generation
            || communicationConversationSignature(orgId, conversationId) !== requestSignature
          ) {
            return;
          }
          revokePreview();
          setDraft({ ...mapUploadError(err), fileName: file.name });
        });
    },
    [conversationId, enabled, orgId, revokePreview],
  );

  const canSendWithAttachment = draft.status === 'ready';

  return { draft, selectFile, removeAttachment, canSendWithAttachment };
}
