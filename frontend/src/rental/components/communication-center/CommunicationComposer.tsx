import { useCallback, useRef, type ReactNode } from 'react';
import { Paperclip, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  COMMUNICATION_REPLY_TEXT_MAX_LENGTH,
  type CommunicationComposerState,
} from '../../../lib/communication/communication-composer-capability';
import type { CommunicationAttachmentDraftState } from '../../../lib/communication/hooks/useCommunicationAttachmentDraft';

interface CommunicationComposerProps {
  state: CommunicationComposerState;
  draft: string;
  sending: boolean;
  errorMessage?: string | null;
  mediaEnabled?: boolean;
  attachmentDraft?: CommunicationAttachmentDraftState;
  replyMode?: 'FREEFORM_TEXT_ALLOWED' | 'TEMPLATE_REQUIRED';
  composerActions?: ReactNode;
  templateSection?: ReactNode;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onSelectFile?: (file: File) => void;
  onRemoveAttachment?: () => void;
}

export function CommunicationComposer({
  state,
  draft,
  sending,
  errorMessage,
  mediaEnabled = false,
  attachmentDraft = { status: 'idle' },
  replyMode = 'FREEFORM_TEXT_ALLOWED',
  composerActions,
  templateSection,
  onDraftChange,
  onSend,
  onSelectFile,
  onRemoveAttachment,
}: CommunicationComposerProps) {
  const { t } = useLanguage();
  const composingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachmentUploading = attachmentDraft.status === 'uploading';
  const attachmentReady = attachmentDraft.status === 'ready';
  const hasAttachment = attachmentDraft.status === 'ready' || attachmentDraft.status === 'uploading';

  const templateRequired = replyMode === 'TEMPLATE_REQUIRED';
  const disabled =
    state.mode !== 'enabled'
    || sending
    || attachmentUploading
    || templateRequired
    || ((!draft.trim() && !attachmentReady)
      || draft.length > COMMUNICATION_REPLY_TEXT_MAX_LENGTH);

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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onSelectFile) {
      onSelectFile(file);
    }
    event.target.value = '';
  };

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
      {hasAttachment ? (
        <div
          className="mb-2 flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-2 py-1.5"
          data-testid="communication-composer-attachment"
        >
          {attachmentDraft.status === 'ready' && attachmentDraft.previewUrl ? (
            <img
              src={attachmentDraft.previewUrl}
              alt=""
              className="h-10 w-10 shrink-0 rounded object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium">
              {attachmentDraft.status === 'uploading'
                ? attachmentDraft.fileName
                : attachmentDraft.status === 'ready'
                  ? attachmentDraft.attachment.fileName
                  : ''}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {attachmentUploading
                ? t('communication.attachments.uploading')
                : attachmentDraft.status === 'ready'
                  ? t('communication.attachments.ready')
                  : null}
            </p>
          </div>
          {onRemoveAttachment ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={t('communication.attachments.remove')}
              disabled={sending || attachmentUploading}
              onClick={onRemoveAttachment}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      ) : null}

      {attachmentDraft.status === 'error' ? (
        <p className="mb-2 text-[12px] text-destructive" role="alert">
          {attachmentDraft.code === 'unsupported'
            ? t('communication.attachments.unsupportedType')
            : attachmentDraft.code === 'too_large'
              ? t('communication.attachments.fileTooLarge')
              : attachmentDraft.code === 'permission_denied'
                ? t('communication.attachments.permissionDenied')
                : t('communication.attachments.uploadFailed')}
        </p>
      ) : null}

      {templateRequired ? (
        <div
          className="mb-2 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/8 px-2.5 py-2 text-[12px] text-foreground"
          role="status"
          data-testid="communication-composer-template-required"
        >
          {t('communication.template.required')}
        </div>
      ) : null}

      {templateSection}

      <label className="sr-only" htmlFor="communication-composer-input">
        {t('communication.composer.label')}
      </label>
      <div className="flex items-end gap-2">
        {mediaEnabled ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label={t('communication.attachments.attachFile')}
              onChange={handleFileChange}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label={t('communication.attachments.attachFile')}
              disabled={sending || attachmentUploading || hasAttachment}
              onClick={() => fileInputRef.current?.click()}
              data-testid="communication-composer-attach"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </>
        ) : null}
        <textarea
          id="communication-composer-input"
          data-testid="communication-composer-input"
          className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-border/50 bg-background px-3 py-2 text-[14px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={t('communication.composer.placeholder')}
          value={draft}
          rows={1}
          maxLength={COMMUNICATION_REPLY_TEXT_MAX_LENGTH}
          disabled={sending || attachmentUploading || templateRequired}
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
        {composerActions}
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
