import { cn } from '../../../components/ui/utils';
import type { WhatsAppAiSuggestionResponse, WhatsAppConfig, WhatsAppConversation, WhatsAppMsg } from '../../../lib/api';
import type { InboxFilter, MobilePane } from './whatsapp.ops';
import { WhatsAppConversationInbox } from './WhatsAppConversationInbox';
import { WhatsAppChatPanel } from './WhatsAppChatPanel';
import { WhatsAppContextDrawer } from './WhatsAppContextDrawer';

interface WhatsAppInboxLayoutProps {
  orgId: string | undefined;
  config: WhatsAppConfig | null;
  conversations: WhatsAppConversation[];
  selected: WhatsAppConversation | null;
  messages: WhatsAppMsg[];
  messagesLoading: boolean;
  search: string;
  filter: InboxFilter;
  mobilePane: MobilePane;
  input: string;
  sending: boolean;
  aiResult: WhatsAppAiSuggestionResponse | null;
  aiLoading: boolean;
  aiSuggestionReason: string | null;
  policyBlock: string | null;
  onSearchChange: (v: string) => void;
  onFilterChange: (f: InboxFilter) => void;
  onSelect: (c: WhatsAppConversation) => void;
  onMobilePane: (p: MobilePane) => void;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onAiSuggest: () => void;
  onSendAiReply: () => void;
  onDismissSuggestion: () => void;
  onUseSuggestionInComposer: () => void;
  onOpenTemplates: () => void;
  onRequestHandover: () => void;
  onConversationRefresh?: () => void;
}

export function WhatsAppInboxLayout({
  orgId,
  config,
  conversations,
  selected,
  messages,
  messagesLoading,
  search,
  filter,
  mobilePane,
  input,
  sending,
  aiResult,
  aiLoading,
  aiSuggestionReason,
  policyBlock,
  onSearchChange,
  onFilterChange,
  onSelect,
  onMobilePane,
  onInputChange,
  onSend,
  onAiSuggest,
  onSendAiReply,
  onDismissSuggestion,
  onUseSuggestionInComposer,
  onOpenTemplates,
  onRequestHandover,
  onConversationRefresh,
}: WhatsAppInboxLayoutProps) {
  const handleSelect = (c: WhatsAppConversation) => {
    onSelect(c);
    onMobilePane('chat');
  };

  return (
    <div
      className="surface-premium grid h-[min(72vh,820px)] min-h-[480px] overflow-hidden rounded-2xl border border-border/40 shadow-[var(--shadow-1)] lg:grid-cols-[280px_1fr_300px]"
    >
      <div
        className={cn(
          'min-h-0',
          mobilePane === 'inbox' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
        )}
      >
        <WhatsAppConversationInbox
          conversations={conversations}
          selectedId={selected?.id ?? null}
          search={search}
          filter={filter}
          onSearchChange={onSearchChange}
          onFilterChange={onFilterChange}
          onSelect={handleSelect}
        />
      </div>

      <div
        className={cn(
          'min-h-0 border-border/40 lg:border-x',
          mobilePane === 'chat' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
        )}
      >
        <WhatsAppChatPanel
          config={config}
          conversation={selected}
          messages={messages}
          loading={messagesLoading}
          input={input}
          sending={sending}
          aiResult={aiResult}
          aiLoading={aiLoading}
          policyBlock={policyBlock}
          showBack
          onBack={() => onMobilePane('inbox')}
          onOpenContext={() => onMobilePane('context')}
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

      <div
        className={cn(
          'min-h-0',
          mobilePane === 'context' ? 'flex flex-col' : 'hidden xl:flex xl:flex-col',
        )}
      >
        <WhatsAppContextDrawer
          orgId={orgId}
          conversation={selected}
          config={config}
          aiSuggestionReason={aiSuggestionReason}
          aiResult={aiResult}
          onClose={() => onMobilePane('chat')}
          onConversationRefresh={onConversationRefresh}
        />
      </div>
    </div>
  );
}
