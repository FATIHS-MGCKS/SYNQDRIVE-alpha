import { DataTable, StatusChip, type DataTableColumn } from '../../../components/patterns';
import { formatAmount, formatDate, STATUS_MAP } from './invoiceFormatters';
import {
  counterpartyDisplayName,
  documentStatusLabelDe,
  documentStatusTone,
  sendStatusLabelDe,
  sendStatusTone,
  vehicleDisplayLine,
} from './invoiceListLabels';
import type { InvoiceListItem } from './invoiceTypes';

interface InvoiceListTableProps {
  items: InvoiceListItem[];
  loading?: boolean;
  onSelect: (item: InvoiceListItem) => void;
}

export function InvoiceListTable({ items, loading, onSelect }: InvoiceListTableProps) {
  const columns: DataTableColumn<InvoiceListItem>[] = [
    {
      key: 'invoiceNumber',
      header: 'Rechnungsnr.',
      cell: (item) => (
        <span className="font-semibold text-brand tabular-nums">{item.invoiceNumber}</span>
      ),
    },
    {
      key: 'party',
      header: 'Kunde / Lieferant',
      cell: (item) => (
        <div className="min-w-[140px] max-w-[220px]">
          <p className="truncate font-medium text-foreground">{counterpartyDisplayName(item)}</p>
          {item.bookingNumber && (
            <p className="truncate text-[11px] text-muted-foreground">{item.bookingNumber}</p>
          )}
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: 'Fahrzeug',
      cell: (item) => (
        <span className="block max-w-[160px] truncate text-muted-foreground">
          {vehicleDisplayLine(item)}
        </span>
      ),
    },
    {
      key: 'invoiceDate',
      header: 'Datum',
      numeric: true,
      cell: (item) => <span className="tabular-nums">{formatDate(item.invoiceDate)}</span>,
    },
    {
      key: 'dueDate',
      header: 'Fällig',
      numeric: true,
      cell: (item) => (
        <span className={item.isOverdue ? 'font-medium text-status-critical tabular-nums' : 'tabular-nums'}>
          {formatDate(item.dueDate)}
        </span>
      ),
    },
    {
      key: 'totalGross',
      header: 'Gesamt',
      align: 'right',
      numeric: true,
      cell: (item) => (
        <span className="font-semibold tabular-nums">{formatAmount(item.totalGross, item.currency)}</span>
      ),
    },
    {
      key: 'outstandingAmount',
      header: 'Offen',
      align: 'right',
      numeric: true,
      cell: (item) => (
        <span
          className={
            item.outstandingAmount > 0
              ? 'font-semibold text-status-watch tabular-nums'
              : 'tabular-nums text-muted-foreground'
          }
        >
          {formatAmount(item.outstandingAmount, item.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (item) => {
        const st = STATUS_MAP[item.status] || STATUS_MAP.DRAFT;
        return (
          <StatusChip tone={item.isOverdue ? 'critical' : 'neutral'} dot className="text-[11px]">
            <span className={st.text}>{st.label}</span>
          </StatusChip>
        );
      },
    },
    {
      key: 'documentStatus',
      header: 'Dokument',
      cell: (item) => (
        <StatusChip tone={documentStatusTone(item.documentStatus)} className="text-[10px]">
          {documentStatusLabelDe(item.documentStatus)}
        </StatusChip>
      ),
    },
    {
      key: 'lastSendStatus',
      header: 'Versand',
      cell: (item) => (
        <StatusChip tone={sendStatusTone(item.lastSendStatus)} className="text-[10px]">
          {sendStatusLabelDe(item.lastSendStatus)}
        </StatusChip>
      ),
    },
  ];

  return (
    <div className="hidden md:block">
      <DataTable
        columns={columns}
        rows={items}
        getRowKey={(item) => item.id}
        loading={loading}
        skeletonRows={8}
        dense
        onRowClick={onSelect}
        getRowClassName={(item) => (item.isOverdue ? 'bg-status-critical-soft/20' : undefined)}
        empty="Keine Rechnungen für die aktuelle Auswahl"
      />
    </div>
  );
}
