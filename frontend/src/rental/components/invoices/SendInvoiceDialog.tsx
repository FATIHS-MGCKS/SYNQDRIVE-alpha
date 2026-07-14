import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { FormDialog } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { SendInvoiceEmailPayload } from './invoiceDocumentTypes';
import { displayNumber } from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN } from './invoiceTheme';

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
    setBodyText(
      `Guten Tag,\n\nanbei erhalten Sie Ihre Rechnung ${number}.\n\nMit freundlichen Grüßen`,
    );
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
      toast.error('Bitte Empfänger-E-Mail angeben');
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

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rechnung per E-Mail senden"
      description={`Rechnung ${displayNumber(invoice)} als PDF-Anhang versenden.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={INVOICE_DISABLED_BTN} onClick={() => onOpenChange(false)}>
            Abbrechen
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
            Senden
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Empfänger
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
            Betreff
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
            Nachricht
          </span>
          <textarea
            className={`${inputCls} min-h-[100px] resize-y`}
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            CC (optional)
          </span>
          <input
            type="text"
            className={inputCls}
            value={ccEmails}
            onChange={(e) => setCcEmails(e.target.value)}
            placeholder="email1@example.com, email2@example.com"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            BCC (optional)
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
