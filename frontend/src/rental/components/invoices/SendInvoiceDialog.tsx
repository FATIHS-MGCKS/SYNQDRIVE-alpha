import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormDialog } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import type { SendInvoiceEmailPayload } from './invoiceDocumentTypes';
import { displayNumber } from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN } from './invoiceTheme';
import {
  buildSendInvoiceDefaultBody,
  SEND_INVOICE_ERROR_RECIPIENT_KEY,
} from '../../lib/send-invoice-i18n';

interface SendInvoiceDialogProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultToEmail?: string | null;
  defaultSubject: string;
  documentId?: string | null;
  sending: boolean;
  onSend: (payload: SendInvoiceEmailPayload) => Promise<boolean>;
}

export function SendInvoiceDialog({
  invoice,
  open,
  onOpenChange,
  defaultToEmail,
  defaultSubject,
  documentId,
  sending,
  onSend,
}: SendInvoiceDialogProps) {
  const { t, locale } = useLanguage();
  const [toEmail, setToEmail] = useState(defaultToEmail ?? '');
  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState('');
  const [ccEmails, setCcEmails] = useState('');
  const [bccEmails, setBccEmails] = useState('');

  useEffect(() => {
    if (!open) return;
    setToEmail(defaultToEmail ?? '');
    setSubject(defaultSubject);
    const number = displayNumber(invoice);
    setBodyText(buildSendInvoiceDefaultBody(locale, number));
    setCcEmails('');
    setBccEmails('');
  }, [open, defaultToEmail, defaultSubject, invoice]);

  const parseEmails = (raw: string) =>
    raw
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSubmit = async () => {
    if (!toEmail.trim()) {
      toast.error(t(SEND_INVOICE_ERROR_RECIPIENT_KEY));
      return;
    }
    const payload: SendInvoiceEmailPayload = {
      toEmail: toEmail.trim(),
      subject: subject.trim() || defaultSubject,
      bodyText: bodyText.trim() || undefined,
      ccEmails: parseEmails(ccEmails),
      bccEmails: parseEmails(bccEmails),
      documentId: documentId ?? undefined,
    };
    const ok = await onSend(payload);
    if (ok) onOpenChange(false);
  };

  const inputCls =
    'w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground outline-none';
  const invoiceNumber = displayNumber(invoice);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('invoices.send.title')}
      description={t('invoices.send.description', { number: invoiceNumber })}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={INVOICE_DISABLED_BTN} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={INVOICE_ACTION_BTN}
            disabled={sending || !toEmail.trim()}
            onClick={() => void handleSubmit()}
          >
            {sending ? (
              <Icon name="loader-2" className="h-3 w-3 animate-spin" />
            ) : (
              <Icon name="mail" className="h-3 w-3" />
            )}
            {t('email.send.modal.send')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('email.send.modal.recipient')}
          </span>
          <input
            type="email"
            className={inputCls}
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('email.send.modal.subject')}
          </span>
          <input
            type="text"
            className={inputCls}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('email.send.modal.body')}
          </span>
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('email.send.modal.cc')}
          </span>
          <input
            type="text"
            className={inputCls}
            value={ccEmails}
            onChange={(e) => setCcEmails(e.target.value)}
            placeholder={t('invoices.send.ccPlaceholder')}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t('email.send.modal.bcc')}
          </span>
          <input
            type="text"
            className={inputCls}
            value={bccEmails}
            onChange={(e) => setBccEmails(e.target.value)}
          />
        </label>
      </div>
    </FormDialog>
  );
}
