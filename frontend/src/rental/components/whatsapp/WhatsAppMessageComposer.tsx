import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import type { WhatsAppAiSuggestionResponse, WhatsAppConfig } from '../../../lib/api';

interface WhatsAppMessageComposerProps {
  config: WhatsAppConfig | null;
  input: string;
  sending: boolean;
  aiLoading: boolean;
  aiResult: WhatsAppAiSuggestionResponse | null;
  hasPolicyBlock?: string | null;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onAiSuggest: () => void;
  onSendAiReply: () => void;
  onDismissSuggestion: () => void;
  onUseSuggestionInComposer: () => void;
  onOpenTemplates: () => void;
  onRequestHandover: () => void;
}

export function WhatsAppMessageComposer({
  config,
  input,
  sending,
  aiLoading,
  aiResult,
  hasPolicyBlock,
  onInputChange,
  onSend,
  onAiSuggest,
  onSendAiReply,
  onDismissSuggestion,
  onUseSuggestionInComposer,
  onOpenTemplates,
  onRequestHandover,
}: WhatsAppMessageComposerProps) {
  const aiMode = config?.aiMode ?? 'OFF';
  const suggestedReply = aiResult?.suggestedReply ?? aiResult?.suggestion ?? null;
  const canAutoSendAi = Boolean(aiResult?.canSendAutomatically);
  const needsHuman =
    aiResult?.decision === 'HUMAN_REQUIRED' || (aiResult?.riskFlags?.length ?? 0) > 0;

  return (
    <div className="border-t border-border/40 surface-frosted p-3">
      {hasPolicyBlock && (
        <p className="mb-2 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-2.5 py-2 text-[10px] text-[color:var(--status-watch)]">
          {hasPolicyBlock}
        </p>
      )}

      {suggestedReply && aiResult && (
        <div className="mb-2 rounded-xl border border-[color:var(--status-ai)]/20 bg-[color:var(--status-ai)]/[0.04] p-3">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Icon name="sparkles" className="h-3.5 w-3.5 text-[color:var(--status-ai)]" />
            <span className="text-[10px] font-semibold text-[color:var(--status-ai)]">
              AI suggestion — review before sending
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {aiResult.intent}
            </span>
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              {Math.round(aiResult.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-foreground">{suggestedReply}</p>

          {aiResult.riskFlags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {aiResult.riskFlags.map(flag => (
                <span
                  key={flag}
                  className="rounded-md border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--status-watch)]"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}

          {aiResult.usedTools.length > 0 && (
            <p className="mt-1.5 text-[9px] text-muted-foreground">
              Data sources: {aiResult.usedTools.join(', ')}
            </p>
          )}

          {aiResult.humanReason && (
            <p className="mt-1 text-[9px] text-[color:var(--status-watch)]">{aiResult.humanReason}</p>
          )}

          <p className="mt-1 text-[9px] text-muted-foreground">
            SynqDrive AI uses Vehicle Intelligence / DIMO telemetry as internal tools — not as the WhatsApp sender.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {canAutoSendAi && (
              <button
                type="button"
                onClick={onSendAiReply}
                disabled={sending}
                className="sq-press rounded-lg bg-[color:var(--status-ai)] px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-50"
              >
                Send AI reply
              </button>
            )}
            {needsHuman && (
              <button
                type="button"
                onClick={onRequestHandover}
                className="sq-press rounded-lg border border-[color:var(--status-watch)]/40 bg-[color:var(--status-watch)]/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-[color:var(--status-watch)]"
              >
                Mark for human review
              </button>
            )}
            <button
              type="button"
              onClick={onUseSuggestionInComposer}
              className="sq-press rounded-lg border border-border/60 px-2.5 py-1.5 text-[10px] font-semibold text-foreground hover:bg-muted"
            >
              Edit in composer
            </button>
            <button
              type="button"
              onClick={onDismissSuggestion}
              className="sq-press px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 gap-1">
          {aiMode !== 'OFF' && (
            <button
              type="button"
              onClick={onAiSuggest}
              disabled={aiLoading}
              title="Get AI suggestion"
              className="sq-press flex h-9 w-9 items-center justify-center rounded-lg bg-[color:var(--status-ai)]/10 text-[color:var(--status-ai)] hover:bg-[color:var(--status-ai)]/15 disabled:opacity-40"
            >
              <Icon name={aiLoading ? 'loader-2' : 'sparkles'} className={cn('h-4 w-4', aiLoading && 'animate-spin')} />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTemplates}
            title="Templates"
            className="sq-press flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon name="file-text" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRequestHandover}
            title="Request human handover"
            className="sq-press flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Icon name="user-check" className="h-4 w-4" />
          </button>
        </div>
        <textarea
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Type a message…"
          rows={1}
          className="max-h-24 min-h-[36px] flex-1 resize-none rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] text-foreground outline-none focus:ring-1 focus:ring-[color:var(--brand)]/30"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!input.trim() || sending}
          className="sq-press flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--status-positive)] text-white disabled:opacity-40"
        >
          <Icon name={sending ? 'loader-2' : 'send'} className={cn('h-4 w-4', sending && 'animate-spin')} />
        </button>
      </div>
    </div>
  );
}
