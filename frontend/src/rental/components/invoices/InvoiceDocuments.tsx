import { Icon } from '../ui/Icon';
import type { Invoice } from './invoiceTypes';
import { INVOICE_ACTION_BTN, INVOICE_DISABLED_BTN, type InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceDocumentsProps extends InvoiceThemeClasses {
  invoice: Invoice;
  canManageEmail: boolean;
  canEmailDocument: boolean;
  loadingSendDoc: boolean;
  onSendEmail: () => void;
}

export function InvoiceDocuments({
  invoice,
  canManageEmail,
  canEmailDocument,
  loadingSendDoc,
  onSendEmail,
  card,
  tp,
  ts,
}: InvoiceDocumentsProps) {
  return (
    <div className={`${card} p-5`}>
      <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Dokumente</h3>
      <div className="space-y-2">
        {invoice.generatedDocumentId ? (
          <p className={`text-xs ${tp}`}>
            Generiertes Dokument verknüpft ({invoice.generatedDocumentId.slice(0, 8)}…)
          </p>
        ) : (
          <button
            type="button"
            disabled
            className={INVOICE_DISABLED_BTN}
            title="Dokumentengenerierung noch nicht verbunden"
          >
            <Icon name="file-text" className="w-3 h-3" /> PDF generieren
          </button>
        )}
        <button
          type="button"
          disabled={!canEmailDocument || loadingSendDoc}
          onClick={onSendEmail}
          className={canEmailDocument ? INVOICE_ACTION_BTN : INVOICE_DISABLED_BTN}
          title={
            !canManageEmail
              ? 'Nur Administratoren können Dokumente per E-Mail senden'
              : canEmailDocument
                ? 'Rechnung per E-Mail senden'
                : 'E-Mail-Versand erfordert Buchung und generiertes PDF'
          }
        >
          {loadingSendDoc ? (
            <Icon name="loader-2" className="w-3 h-3 animate-spin" />
          ) : (
            <Icon name="mail" className="w-3 h-3" />
          )}{' '}
          Per E-Mail senden
        </button>
        {invoice.documentExtractionId && (
          <p className={`text-[10px] ${ts}`}>Extraktion: {invoice.documentExtractionId.slice(0, 12)}…</p>
        )}
      </div>
    </div>
  );
}
