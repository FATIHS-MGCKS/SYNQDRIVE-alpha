import { useCallback, useRef, useState } from 'react';
import { communicationClient } from '../communication-client';
import { communicationConversationSignature } from '../query-keys';

export function useCommunicationAiSuggestion(options: {
  orgId: string | null | undefined;
  conversationId: string | null | undefined;
  enabled?: boolean;
  onApplySuggestion?: (text: string) => void;
  hasExistingDraft?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const generate = useCallback(async () => {
    if (!options.orgId || !options.conversationId || options.enabled === false) return;
    if (options.hasExistingDraft) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await communicationClient.getAiSuggestion(
        options.orgId,
        options.conversationId,
      );
      if (requestId !== requestIdRef.current) return;
      if (result.suggestedReply?.trim()) {
        options.onApplySuggestion?.(result.suggestedReply);
      }
    } catch {
      if (requestId !== requestIdRef.current) return;
      setError('AI_SUGGESTION_FAILED');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [
    options.conversationId,
    options.enabled,
    options.hasExistingDraft,
    options.onApplySuggestion,
    options.orgId,
  ]);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    setLoading(false);
    setError(null);
  }, []);

  return {
    loading,
    error,
    generate,
    reset,
    signature: communicationConversationSignature(options.orgId, options.conversationId),
  };
}
