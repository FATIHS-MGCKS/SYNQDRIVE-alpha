import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { SendDocumentsEmailModal } from '../../../components/email/SendDocumentsEmailModal';
import { api, type BookingDocumentBundleView, type GeneratedDocumentDto } from '../../../lib/api';
import { isEmailSendableDocument } from '../../../lib/email-sendable';
import { emailDocTypeLabel } from '../../../lib/email-i18n';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';

const CHECKOUT_DOC_TYPES = [
  { type: 'TERMS_AND_CONDITIONS', icon: 'file-text' as const, tone: 'text-[color:var(--status-info)]' },
  { type: 'WITHDRAWAL_INFORMATION', icon: 'file-text' as const, tone: 'text-[color:var(--status-watch)]' },
  { type: 'PRIVACY_POLICY', icon: 'shield' as const, tone: 'text-[color:var(--status-ai)]' },
  { type: 'BOOKING_INVOICE', icon: 'receipt' as const, tone: 'text-[color:var(--status-watch)]' },
  { type: 'RENTAL_CONTRACT', icon: 'file-text' as const, tone: 'text-[color:var(--status-positive)]' },
];

export interface CheckoutDocumentsPanelProps {
  orgId: string;
  bookingId: string | null;
  customerEmail?: string | null;
  bundle: BookingDocumentBundleView | null;
  loading: boolean;
  error?: string | null;
  onRefresh?: () => void;
  showBulkSend?: boolean;
}

export function CheckoutDocumentsPanel({
  orgId,
  bookingId,
  customerEmail,
  bundle,
  loading,
  error,
  onRefresh,
  showBulkSend = false,
}: CheckoutDocumentsPanelProps) {
  const { t } = useLanguage();
  const [sendOpen, setSendOpen] = useState(false);
  const [preselectedIds, setPreselectedIds] = useState<string[]>([]);

  const docsByType = useMemo(() => {
    const map = new Map<string, GeneratedDocumentDto>();
    for (const doc of bundle?.documents ?? []) {
      if (doc.status !== 'VOID') map.set(doc.documentType, doc);
    }
    return map;
  }, [bundle]);

  const sendableDocs = useMemo(
    () => (bundle?.documents ?? []).filter((d) => isEmailSendableDocument(d.status)),
    [bundle],
  );

  const openSend = (doc: GeneratedDocumentDto) => {
    setPreselectedIds([doc.id]);
    setSendOpen(true);
  };

  return (
    <div className="space-y-3">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Dokumente werden vorbereitet…
        </div>
      )}
      {error && <p className="text-xs text-[color:var(--status-critical)]">{error}</p>}
      {!loading && bundle?.warnings?.map((warning) => (
        <p key={warning} className="text-xs text-[color:var(--status-watch)]">{warning}</p>
      ))}

      {CHECKOUT_DOC_TYPES.map(({ type, icon, tone }) => {
        const doc = docsByType.get(type);
        const label = emailDocTypeLabel(t, type);
        const ready = doc && isEmailSendableDocument(doc.status);
        const sent = doc?.status === 'SENT';
        return (
          <div
            key={type}
            className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2.5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Icon name={icon} className={`h-5 w-5 shrink-0 ${tone}`} />
              <div className="min-w-0">
                <span className="text-xs text-foreground">{label}</span>
                {ready ? (
                  sent ? (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 text-[11px] sq-chip-neutral">
                      Versendet
                    </span>
                  ) : (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 text-[11px] sq-chip-success">
                      Bereit
                    </span>
                  )
                ) : (
                  <span className="ml-2 text-[11px] text-muted-foreground">
                    {loading ? 'Wird erstellt…' : 'Noch nicht verfügbar'}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={!ready || !bookingId}
                onClick={() => doc && api.documents.open(orgId, doc.id)}
                title="Drucken / Öffnen"
                className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="printer" className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={!ready || !bookingId || !customerEmail}
                onClick={() => doc && openSend(doc)}
                title={customerEmail ? 'Per E-Mail senden' : 'Kunden-E-Mail fehlt'}
                className="rounded-md p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon name="send" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}

      {showBulkSend && bookingId && sendableDocs.length > 0 && (
        <button
          type="button"
          disabled={!customerEmail}
          onClick={() => {
            setPreselectedIds(sendableDocs.map((d) => d.id));
            setSendOpen(true);
          }}
          className="sq-3d-btn sq-3d-btn--primary w-full px-3 py-2 text-xs disabled:opacity-50"
        >
          {t('email.send.sendAll')}
        </button>
      )}

      {bookingId && (
        <SendDocumentsEmailModal
          open={sendOpen}
          onOpenChange={setSendOpen}
          orgId={orgId}
          bookingId={bookingId}
          defaultToEmail={customerEmail}
          documents={sendableDocs}
          preselectedDocumentIds={preselectedIds}
          onSent={() => onRefresh?.()}
        />
      )}
    </div>
  );
}
