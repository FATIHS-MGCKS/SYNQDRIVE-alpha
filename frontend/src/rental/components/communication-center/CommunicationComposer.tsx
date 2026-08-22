import { useCallback, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  COMMUNICATION_REPLY_TEXT_MAX_LENGTH,
  type CommunicationComposerState,
} from '../../../lib/communication/communication-composer-capability';

interface CommunicationComposerProps {
  state: CommunicationComposerState;
  draft: string;
  sending: boolean;
  errorMessage?: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
}

export function CommunicationComposer({
  state,
  draft,
  sending,
  errorMessage,
  onDraftChange,
  onSend,
}: CommunicationComposerProps) {
  const { t } = useLanguage();
  const composingRef = useRef(false);

  const disabled =
    state.mode !== 'enabled'
    || sending
    || !draft.trim()
    || draft.length > COMMUNICATION_REPLY_TEXT_MAX_LENGTH;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        if (event.nativeEvent.isComposing || composingRef.current) {
          return;
        }
        event.preventDefault();
        if (!disabled) {
          onSend();
        }
      }
    },
    [disabled, onSend],
  );

  if (state.mode === 'hidden') {
    return null;
  }

  if (state.mode === 'blocked') {
    const message =
      state.reason === 'CHANNEL_NOT_CONFIGURED'
        ? t('communication.composer.smsNotConfigured')
        : state.reason === 'OWNED_BY_OTHER'
          ? t('communication.composer.ownedByOther')
          : t('communication.composer.channelUnsupported');

    return (
      <div
        className="shrink-0 border-t border-border/30 bg-background/80 px-3 py-3 text-[13px] text-muted-foreground"
        data-testid="communication-composer-blocked"
      >
        {message}
      </div>
    );
  }

  return (
    <div
      className="shrink-0 border-t border-border/30 bg-background/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-testid="communication-composer"
    >
      <label className="sr-only" htmlFor="communication-composer-input">
        {t('communication.composer.label')}
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="communication-composer-input"
          data-testid="communication-composer-input"
          className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-[14px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t('communication.composer.placeholder')}
          value={draft}
          rows={1}
          maxLength={COMMUNICATION_REPLY_TEXT_MAX_LENGTH}
          disabled={sending}
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? 'communication-composer-error' : undefined}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          aria-label={t('communication.composer.sendLabel')}
          onClick={onSend}
        >
          {sending ? t('communication.composer.sending') : t('communication.composer.send')}
        </Button>
      </div>
      {errorMessage ? (
        <p
          id="communication-composer-error"
          className="mt-2 text-[12px] text-destructive"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      {draft.length > COMMUNICATION_REPLY_TEXT_MAX_LENGTH - 200 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {draft.length}/{COMMUNICATION_REPLY_TEXT_MAX_LENGTH}
        </p>
      ) : null}
    </div>
  );
}
