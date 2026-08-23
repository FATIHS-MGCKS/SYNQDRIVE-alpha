import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import type { WhatsAppConversationContext } from '../../api';
import { communicationConversationSignature } from '../query-keys';

export function useCommunicationQuickActions(options: {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  channel?: string | null;
  enabled?: boolean;
}) {
  const [context, setContext] = useState<WhatsAppConversationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const reload = useCallback(async () => {
    if (!options.orgId || !options.conversationId || options.channel !== 'WHATSAPP') {
      setContext(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await communicationClient.getQuickActions(options.orgId, options.conversationId);
      if (requestId !== requestIdRef.current) return;
      setContext(result);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setContext(null);
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

  const execute = useCallback(
    async (actionId: string, requiresConfirm?: boolean) => {
      if (!options.orgId || !options.conversationId) return;
      if (requiresConfirm && !window.confirm(actionId)) return;
      setRunningActionId(actionId);
      try {
        await communicationClient.executeQuickAction(
          options.orgId,
          options.conversationId,
          actionId as import('../../api').WhatsAppQuickActionId,
        );
        await reload();
      } finally {
        setRunningActionId(null);
      }
    },
    [options.conversationId, options.orgId, reload],
  );

  return { context, loading, runningActionId, reload, execute };
}
