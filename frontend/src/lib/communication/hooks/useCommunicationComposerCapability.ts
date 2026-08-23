import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import { communicationConversationSignature } from '../query-keys';

export type CommunicationComposerReplyMode =
  | 'FREEFORM_TEXT_ALLOWED'
  | 'TEMPLATE_REQUIRED'
  | 'CHANNEL_NOT_REPLYABLE';

export function useCommunicationComposerCapability(options: {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  channel?: string | null;
  enabled?: boolean;
}) {
  const [replyMode, setReplyMode] = useState<CommunicationComposerReplyMode>('FREEFORM_TEXT_ALLOWED');
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!options.orgId || !options.conversationId || options.channel !== 'WHATSAPP') {
      setReplyMode('FREEFORM_TEXT_ALLOWED');
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await communicationClient.getComposerCapability(
        options.orgId,
        options.conversationId,
      );
      if (requestId !== requestIdRef.current) return;
      setReplyMode(result.replyMode);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setReplyMode('FREEFORM_TEXT_ALLOWED');
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

  return { replyMode, loading, reload };
}
