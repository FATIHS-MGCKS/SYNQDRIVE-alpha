import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Paperclip } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '../ui/button';
import { FormDialog } from '../patterns';
import { api, type GeneratedDocumentDto } from '../../lib/api';
import { dedupeDocumentsByType } from '../../lib/document-list.utils';
import { isEmailSendableDocument } from '../../lib/email-sendable';
import { emailDocTypeLabel } from '../../lib/email-i18n';
import { useLanguage } from '../../rental/i18n/LanguageContext';

export interface SendDocumentsEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  bookingId: string;
  bookingNumber?: string | null;
  bookingPeriodLabel?: string | null;
  customerName?: string | null;
  defaultToEmail?: string | null;
  documents: GeneratedDocumentDto[];
  preselectedDocumentIds?: string[];
  onSent?: () => void;
}

export function SendDocumentsEmailModal({
  open,
  onOpenChange,
  orgId,
  bookingId,
  bookingNumber,
  bookingPeriodLabel,
  customerName,
  defaultToEmail,
  documents,
  preselectedDocumentIds,
  onSent,
}: SendDocumentsEmailModalProps) {
  const { t } = useLanguage();

  const sendable = useMemo(
    () => dedupeDocumentsByType(documents.filter((d) => isEmailSendableDocument(d.status))),
    [documents],
  );

  const buildDocumentsListHtml = (ids: string[]) => {
    const labels = sendable
      .filter((d) => ids.includes(d.id))
      .map((d) => emailDocTypeLabel(t, d.documentType, d.title));
    if (labels.length === 0) return '<ul></ul>';
    return `<ul>${labels.map((label) => `<li>${label}</li>`).join('')}</ul>`;
  };

  const [toEmail, setToEmail] = useState(defaultToEmail ?? '');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState('');
  const [bccEmails, setBccEmails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToEmail(defaultToEmail ?? '');
    const defaults =
      preselectedDocumentIds && preselectedDocumentIds.length > 0
        ? preselectedDocumentIds
        : sendable.map((d) => d.id);
    const selected = defaults.filter((id) => sendable.some((d) => d.id === id));
    const number = bookingNumber?.trim() || '—';
    const period = bookingPeriodLabel?.trim() || '—';
    const name = customerName?.trim() || t('email.send.defaultCustomerName');
    setSubject(t('email.send.defaultSubjectBooking', { number, period }));
    setBodyHtml(
      t('email.send.defaultBodyBooking', {
        customerName: name,
        documentsList: buildDocumentsListHtml(selected),
      }),
    );
    setSelectedIds(selected);
    setCcEmails('');
    setBccEmails('');
    setError(null);
  }, [open, defaultToEmail, bookingNumber, bookingPeriodLabel, customerName, preselectedDocumentIds, sendable, t]);

  const refreshBodyForSelection = (ids: string[]) => {
    const name = customerName?.trim() || t('email.send.defaultCustomerName');
    setBodyHtml(
      t('email.send.defaultBodyBooking', {
        customerName: name,
        documentsList: buildDocumentsListHtml(ids),
      }),
    );
  };

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      refreshBodyForSelection(next);
      return next;
    });
  };

  const parseEmailList = (value: string): string[] | undefined => {
    const list = value
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter(Boolean);
    return list.length > 0 ? list : undefined;
  };

  const handleSend = async () => {
    if (!toEmail.trim() || selectedIds.length === 0) {
      setError(t('email.send.modal.errorRequired'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.documents.sendBookingEmail(orgId, bookingId, {
        toEmail: toEmail.trim(),
        subject: subject.trim(),
        bodyHtml,
        ccEmails: parseEmailList(ccEmails),
        bccEmails: parseEmailList(bccEmails),
        documentIds: selectedIds,
      });
      toast.success(t('email.send.success'));
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || t('email.send.modal.errorSend'));
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
          <Mail className="w-4 h-4" /> {t('email.send.modal.title')}
        </span>
      }
      description={t('email.send.modal.description')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending || sendable.length === 0}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {t('email.send.modal.send')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('email.send.modal.recipient')}</label>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('email.send.modal.subject')}</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('email.send.modal.cc')}</label>
            <input
              type="text"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="cc1@example.com, cc2@…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('email.send.modal.bcc')}</label>
            <input
              type="text"
              value={bccEmails}
              onChange={(e) => setBccEmails(e.target.value)}
              placeholder="bcc@example.com"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('email.send.modal.body')}</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
            <Paperclip className="w-3.5 h-3.5" /> {t('email.send.modal.attachments', { count: selectedIds.length })}
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {sendable.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('email.send.modal.noDocuments')}</p>
            ) : (
              sendable.map((doc) => (
                <label
                  key={doc.id}
                  className="flex items-start gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">
                      {emailDocTypeLabel(t, doc.documentType, doc.title)}
                    </span>
                    {doc.documentNumber ? (
                      <span className="text-muted-foreground"> · {doc.documentNumber}</span>
                    ) : null}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    </FormDialog>
  );
}