import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import { communicationConversationSignature } from '../query-keys';

export interface CommunicationSendableTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  bodyTemplate: string;
  variableSchema?: Record<string, unknown> | null;
  providerStatus: string;
}

export function useCommunicationSendableTemplates(options: {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  channel?: string | null;
  open?: boolean;
}) {
  const [items, setItems] = useState<CommunicationSendableTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!options.open || !options.orgId || !options.conversationId || options.channel !== 'WHATSAPP') {
      setItems([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await communicationClient.listSendableTemplates(
        options.orgId,
        options.conversationId,
      );
      if (requestId !== requestIdRef.current) return;
      setItems(result.items);
    } catch {
      if (requestId !== requestIdRef.current) return;
      setItems([]);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [options.channel, options.conversationId, options.open, options.orgId]);

  useEffect(() => {
    void load();
  }, [
    load,
    communicationConversationSignature(options.orgId, options.conversationId),
    options.open,
  ]);

  return { items, loading, reload: load };
}
