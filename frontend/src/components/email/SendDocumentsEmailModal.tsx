import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Paperclip } from 'lucide-react';

import { Button } from '../ui/button';
import { FormDialog } from '../patterns';
import { api, type GeneratedDocumentDto } from '../../lib/api';

const TYPE_LABEL: Record<string, string> = {
  BOOKING_INVOICE: 'Rechnung',
  DEPOSIT_RECEIPT: 'Kautionsbeleg',
  RENTAL_CONTRACT: 'Mietvertrag',
  TERMS_AND_CONDITIONS: 'AGB',
  WITHDRAWAL_INFORMATION: 'Widerrufsbelehrung',
  HANDOVER_PICKUP: 'Übergabeprotokoll (Abholung)',
  HANDOVER_RETURN: 'Übergabeprotokoll (Rückgabe)',
  FINAL_INVOICE: 'Schlussrechnung',
};

export interface SendDocumentsEmailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  bookingId: string;
  bookingNumber?: string | null;
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
  defaultToEmail,
  documents,
  preselectedDocumentIds,
  onSent,
}: SendDocumentsEmailModalProps) {
  const sendable = useMemo(
    () => documents.filter((d) => d.status !== 'VOID'),
    [documents],
  );

  const [toEmail, setToEmail] = useState(defaultToEmail ?? '');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(
    '<p>Sehr geehrte Damen und Herren,</p><p>im Anhang finden Sie die angeforderten Dokumente zu Ihrer Buchung.</p><p>Mit freundlichen Grüßen</p>',
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToEmail(defaultToEmail ?? '');
    setSubject(
      bookingNumber
        ? `Ihre Buchungsdokumente — ${bookingNumber}`
        : 'Ihre Buchungsdokumente',
    );
    const defaults =
      preselectedDocumentIds && preselectedDocumentIds.length > 0
        ? preselectedDocumentIds
        : sendable.map((d) => d.id);
    setSelectedIds(defaults.filter((id) => sendable.some((d) => d.id === id)));
    setError(null);
  }, [open, defaultToEmail, bookingNumber, preselectedDocumentIds, sendable]);

  const toggleDoc = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSend = async () => {
    if (!toEmail.trim() || selectedIds.length === 0) {
      setError('Empfänger und mindestens ein Dokument erforderlich');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.documents.sendBookingEmail(orgId, bookingId, {
        toEmail: toEmail.trim(),
        subject: subject.trim(),
        bodyHtml,
        documentIds: selectedIds,
      });
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message || 'Versand fehlgeschlagen');
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
          <Mail className="w-4 h-4" /> Dokumente per E-Mail senden
        </span>
      }
      description="PDF-Anhänge werden aus den gespeicherten Buchungsdokumenten versendet."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Abbrechen
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={sending || sendable.length === 0}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Senden
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
          <label className="text-xs font-medium text-muted-foreground">Empfänger</label>
          <input
            type="email"
            value={toEmail}
            onChange={(e) => setToEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Betreff</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Nachricht</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
            <Paperclip className="w-3.5 h-3.5" /> Anhänge ({selectedIds.length})
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {sendable.length === 0 ? (
              <p className="text-xs text-muted-foreground">Keine versendbaren Dokumente vorhanden.</p>
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
                    <span className="font-medium">{TYPE_LABEL[doc.documentType] ?? doc.title}</span>
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
