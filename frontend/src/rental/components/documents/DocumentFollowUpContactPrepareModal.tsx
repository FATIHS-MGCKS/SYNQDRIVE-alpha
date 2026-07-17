import { useEffect, useState } from 'react';
import { Loader2, Mail, Paperclip } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../../components/ui/button';
import { FormDialog } from '../../components/patterns';
import { api } from '../../lib/api';
import type { PublicDocumentFollowUpContactPrepare } from '../lib/document-extraction.types';
import type { TranslationKey } from '../i18n/translations/en';

export interface DocumentFollowUpContactPrepareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  vehicleId: string | null;
  extractionId: string;
  suggestionId: string;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  onSent?: () => void;
}

export function DocumentFollowUpContactPrepareModal({
  open,
  onOpenChange,
  orgId,
  vehicleId,
  extractionId,
  suggestionId,
  t,
  onSent,
}: DocumentFollowUpContactPrepareModalProps) {
  const [preview, setPreview] = useState<PublicDocumentFollowUpContactPrepare | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toEmail, setToEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [attachDocument, setAttachDocument] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setAttachDocument(false);

    const load = async () => {
      try {
        const data = vehicleId
          ? await api.vehicleIntelligence.getFollowUpContactPrepare(
              vehicleId,
              extractionId,
              suggestionId,
            )
          : await api.documentExtraction.getFollowUpContactPrepare(
              orgId,
              extractionId,
              suggestionId,
            );
        if (cancelled) return;
        setPreview(data);
        setToEmail(data.recipient.email ?? '');
        setSubject(data.subject);
        setBodyText(data.bodyText);
        if (vehicleId) {
          await api.vehicleIntelligence.recordFollowUpContactPrepareOpened(
            vehicleId,
            extractionId,
            suggestionId,
          );
        } else {
          await api.documentExtraction.recordFollowUpContactPrepareOpened(
            orgId,
            extractionId,
            suggestionId,
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || t('docUpload.followUp.contact.errorLoad'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, vehicleId, extractionId, suggestionId, t]);

  const handleSend = async () => {
    if (!toEmail.trim() || !subject.trim() || !bodyText.trim()) {
      setError(t('docUpload.followUp.contact.errorRequired'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const bodyHtml = bodyText
        .split('\n')
        .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
        .join('');
      const payload = {
        toEmail: toEmail.trim(),
        subject: subject.trim(),
        bodyHtml,
        bodyText,
        attachDocument,
      };
      if (vehicleId) {
        await api.vehicleIntelligence.sendFollowUpContact(
          vehicleId,
          extractionId,
          suggestionId,
          payload,
        );
      } else {
        await api.documentExtraction.sendFollowUpContact(
          orgId,
          extractionId,
          suggestionId,
          payload,
        );
      }
      toast.success(t('docUpload.followUp.contact.sendSuccess'));
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || t('docUpload.followUp.contact.errorSend'));
    } finally {
      setSending(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      maxWidthClassName="sm:max-w-xl"
      title={
        <span className="inline-flex items-center gap-2">
          <Mail className="w-4 h-4" /> {t('docUpload.followUp.contact.modalTitle')}
        </span>
      }
      description={t('docUpload.followUp.contact.modalDescription')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending || loading || !preview}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {t('docUpload.followUp.contact.send')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('docUpload.followUp.contact.loading')}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {preview ? (
          <>
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground space-y-1">
              <p>
                {t('docUpload.followUp.contact.sender', {
                  from: preview.sender.fromEmail,
                  replyTo: preview.sender.replyToEmail ?? '—',
                })}
              </p>
              <p>
                {t('docUpload.followUp.contact.documentRef', {
                  label: preview.documentReference.displayLabel,
                })}
              </p>
              {preview.sendBlockedReason && !preview.recipient.email ? (
                <p className="text-[color:var(--status-watch)]">{preview.sendBlockedReason}</p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t('docUpload.followUp.contact.recipient')}
              </label>
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t('docUpload.followUp.contact.subject')}
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">
                {t('docUpload.followUp.contact.body')}
              </label>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>

            {preview.attachmentOffer.available ? (
              <label className="flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40">
                <input
                  type="checkbox"
                  checked={attachDocument}
                  onChange={(e) => setAttachDocument(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  {t('docUpload.followUp.contact.attachDocument', {
                    fileName: preview.attachmentOffer.fileName ?? preview.extractionId,
                  })}
                </span>
              </label>
            ) : null}

            <p className="text-[10px] text-muted-foreground">{t('docUpload.followUp.contact.noAutoSendHint')}</p>
          </>
        ) : null}
      </div>
    </FormDialog>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
