import { Icon } from '../ui/Icon';
import type { Invoice } from './invoiceTypes';
import type { InvoiceThemeClasses } from './invoiceTheme';
import { InvoiceListRow } from './InvoiceListRow';

interface InvoiceListProps extends Pick<InvoiceThemeClasses, 'isDarkMode' | 'tp' | 'ts'> {
  invoices: Invoice[];
  loading: boolean;
  searchTerm: string;
  statusFilter: string;
  onSelect: (invoice: Invoice) => void;
}

const TABLE_HEADERS = ['Nr.', 'Typ', 'Titel', 'Betrag', 'Datum', 'Fällig', 'Status', 'Aufgabe'];

export function InvoiceList({
  invoices,
  loading,
  searchTerm,
  statusFilter,
  isDarkMode,
  tp,
  ts,
  onSelect,
}: InvoiceListProps) {
  return (
    <div className="surface-premium rounded-2xl overflow-hidden shadow-[var(--shadow-1)]">
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Icon name="loader-2" className={`w-5 h-5 animate-spin ${ts}`} />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="receipt" className={`w-10 h-10 mx-auto mb-3 ${ts} opacity-40`} />
          <p className={`text-sm font-medium ${tp}`}>Keine Rechnungen gefunden</p>
          <p className={`text-xs mt-1 ${ts}`}>
            {searchTerm || statusFilter !== 'all'
              ? 'Versuchen Sie andere Filter.'
              : 'Erstellen Sie Ihre erste Rechnung oder laden Sie ein Dokument hoch.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead>
              <tr className="bg-muted/50">
                {TABLE_HEADERS.map((h) => (
                  <th
                    key={h}
                    className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${ts}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkMode ? 'divide-border/30' : 'divide-gray-100'}`}>
              {invoices.map((inv) => (
                <InvoiceListRow
                  key={inv.id}
                  invoice={inv}
                  isDarkMode={isDarkMode}
                  tp={tp}
                  ts={ts}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
