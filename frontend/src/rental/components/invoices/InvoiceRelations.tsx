import { Building2, Calendar, FileText, Receipt, Tag, User } from 'lucide-react';

import { Icon } from '../ui/Icon';
import { INVOICE_TEMPLATES } from './invoiceConstants';
import type { Invoice } from './invoiceTypes';
import { InvoiceDetailRow } from './InvoiceDetailRow';
import type { InvoiceThemeClasses } from './invoiceTheme';

interface InvoiceRelationsProps extends InvoiceThemeClasses {
  invoice: Invoice;
}

export function InvoiceRelations({ invoice, card, tp, ts, isDarkMode }: InvoiceRelationsProps) {
  return (
    <>
      <div className={`${card} p-5`}>
        <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Zuordnung</h3>
        <div className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
          {invoice.customerId && (
            <InvoiceDetailRow
              label="Kunde"
              value={<span className="text-emerald-500 font-medium">Verknüpft</span>}
              icon={User}
              tp={tp}
              ts={ts}
            />
          )}
          {invoice.vendorName && (
            <InvoiceDetailRow label="Lieferant" value={invoice.vendorName} icon={Building2} tp={tp} ts={ts} />
          )}
          {invoice.bookingId && (
            <InvoiceDetailRow
              label="Buchung"
              value={<span className="text-status-info font-medium">Verknüpft</span>}
              icon={Calendar}
              tp={tp}
              ts={ts}
            />
          )}
          {invoice.vehicleId && (
            <InvoiceDetailRow
              label="Fahrzeug"
              value={<span className="font-mono text-[11px]">{invoice.vehicleId.slice(0, 12)}…</span>}
              icon={Tag}
              tp={tp}
              ts={ts}
            />
          )}
          <InvoiceDetailRow
            label="Herkunft"
            value={
              invoice.type === 'OUTGOING_BOOKING'
                ? 'Automatisch (Buchung)'
                : invoice.type === 'INCOMING_UPLOADED' || invoice.documentExtractionId
                  ? 'Document Extraction'
                  : 'Manuell'
            }
            icon={FileText}
            tp={tp}
            ts={ts}
          />
          {invoice.templateId && (
            <InvoiceDetailRow
              label="Vorlage"
              value={INVOICE_TEMPLATES.find((t) => t.id === invoice.templateId)?.name || invoice.templateId}
              icon={Receipt}
              tp={tp}
              ts={ts}
            />
          )}
        </div>
      </div>

      {invoice.tasks && invoice.tasks.length > 0 && (
        <div className={`${card} p-5`}>
          <h3 className={`text-xs font-bold ${tp} mb-3 uppercase tracking-wider`}>Verknüpfte Aufgabe</h3>
          {invoice.tasks.map((t) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${isDarkMode ? 'border-border/30 bg-muted/30' : 'border-gray-100 bg-gray-50/50'}`}
            >
              <Icon
                name="list-todo"
                className={`w-4 h-4 ${t.status === 'DONE' ? 'text-green-500' : 'text-amber-500'}`}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${tp} truncate`}>{t.title}</p>
                <p className={`text-[10px] ${ts}`}>
                  {t.status === 'DONE' ? 'Erledigt' : t.status === 'IN_PROGRESS' ? 'In Bearbeitung' : 'Offen'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
