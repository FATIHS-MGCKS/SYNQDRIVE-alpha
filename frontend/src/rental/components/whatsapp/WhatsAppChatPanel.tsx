import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';
import { EmptyState } from '../../../components/patterns/states';
import { StatusChip } from '../../../components/patterns';
import type { WhatsAppAiSuggestionResponse, WhatsAppConfig, WhatsAppConversation, WhatsAppMsg } from '../../../lib/api';
import { conversationDisplayName } from './whatsapp.ops';
import { WhatsAppMessageBubble } from './WhatsAppMessageBubble';
import { WhatsAppMessageComposer } from './WhatsAppMessageComposer';

interface WhatsAppChatPanelProps {
  config: WhatsAppConfig | null;
  conversation: WhatsAppConversation | null;
  messages: WhatsAppMsg[];
  loading: boolean;
  input: string;
  sending: boolean;
  aiResult: WhatsAppAiSuggestionResponse | null;
  aiLoading: boolean;
  policyBlock: string | null;
  showBack?: boolean;
  onBack?: () => void;
  onOpenContext?: () => void;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onAiSuggest: () => void;
  onSendAiReply: () => void;
  onDismissSuggestion: () => void;
  onUseSuggestionInComposer: () => void;
  onOpenTemplates: () => void;
  onRequestHandover: () => void;
}

export function WhatsAppChatPanel({
  config,
  conversation,
  messages,
  loading,
  input,
  sending,
  aiResult,
  aiLoading,
  policyBlock,
  showBack,
  onBack,
  onOpenContext,
  onInputChange,
  onSend,
  onAiSuggest,
  onSendAiReply,
  onDismissSuggestion,
  onUseSuggestionInComposer,
  onOpenTemplates,
  onRequestHandover,
}: WhatsAppChatPanelProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, aiResult]);

  if (!conversation) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center bg-muted/10">
        <EmptyState
          icon={<Icon name="message-circle" className="h-5 w-5" />}
          title="Select a conversation"
          description="Choose a thread from the inbox to view messages and linked SynqDrive context."
        />
      </div>
    );
  }

  const name = conversationDisplayName(conversation);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
        {showBack && onBack && (
          <button type="button" onClick={onBack} className="sq-press rounded-lg p-1.5 hover:bg-muted lg:hidden">
            <Icon name="arrow-left" className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--status-positive)]/10 text-[10px] font-bold text-[color:var(--status-positive)]">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[12px] font-semibold text-foreground">{name}</h3>
          <p className="truncate text-[10px] text-muted-foreground">{conversation.contactPhone}</p>
        </div>
        <div className="flex items-center gap-1">
          {conversation.status === 'PENDING_HUMAN' && (
            <StatusChip tone="watch">
              Handover
            </StatusChip>
          )}
          {onOpenContext && (
            <button
              type="button"
              onClick={onOpenContext}
              className="sq-press rounded-lg border border-border/60 px-2 py-1 text-[9px] font-semibold text-muted-foreground hover:bg-muted xl:hidden"
            >
              Context
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Icon name="loader-2" className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyState compact title="No messages yet" description="Send a reply or wait for the customer." />
        ) : (
          messages.map(m => <WhatsAppMessageBubble key={m.id} msg={m} />)
        )}
        <div ref={endRef} />
      </div>

      <WhatsAppMessageComposer
        config={config}
        input={input}
        sending={sending}
        aiLoading={aiLoading}
        aiResult={aiResult}
        hasPolicyBlock={policyBlock}
        onInputChange={onInputChange}
        onSend={onSend}
        onAiSuggest={onAiSuggest}
        onSendAiReply={onSendAiReply}
        onDismissSuggestion={onDismissSuggestion}
        onUseSuggestionInComposer={onUseSuggestionInComposer}
        onOpenTemplates={onOpenTemplates}
        onRequestHandover={onRequestHandover}
      />
    </div>
  );
}
