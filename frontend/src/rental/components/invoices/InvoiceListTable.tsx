import { ChevronRight } from 'lucide-react';

import { DataTable, StatusChip, type DataTableColumn } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatInvoiceListAmount,
  formatInvoiceListDate,
  invoiceListStatusStyle,
  labelInvoiceListStatus,
} from '../../lib/invoice-list-i18n';
import {
  counterpartyDisplayName,
  documentStatusLabel,
  documentStatusTone,
  sendStatusLabel,
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
  const { locale, t } = useLanguage();

  const columns: DataTableColumn<InvoiceListItem>[] = [
    {
      key: 'invoiceNumber',
      header: t('invoices.list.col.invoiceNumber'),
      cell: (item) => (
        <span className="font-semibold text-brand tabular-nums">{item.invoiceNumber}</span>
      ),
    },
    {
      key: 'party',
      header: t('invoices.list.col.party'),
      cell: (item) => (
        <div className="min-w-[140px] max-w-[220px]">
          <p className="truncate font-medium text-foreground">{counterpartyDisplayName(item, locale)}</p>
          {item.bookingNumber && (
            <p className="truncate text-[11px] text-muted-foreground">{item.bookingNumber}</p>
          )}
        </div>
      ),
    },
    {
      key: 'vehicle',
      header: t('invoices.list.col.vehicle'),
      cell: (item) => (
        <span className="block max-w-[160px] truncate text-muted-foreground">
          {vehicleDisplayLine(item, locale)}
        </span>
      ),
    },
    {
      key: 'invoiceDate',
      header: t('invoices.list.col.date'),
      numeric: true,
      cell: (item) => (
        <span className="tabular-nums">{formatInvoiceListDate(locale, item.invoiceDate)}</span>
      ),
    },
    {
      key: 'dueDate',
      header: t('invoices.list.col.dueDate'),
      numeric: true,
      cell: (item) => (
        <span className={item.isOverdue ? 'font-medium text-status-critical tabular-nums' : 'tabular-nums'}>
          {formatInvoiceListDate(locale, item.dueDate)}
        </span>
      ),
    },
    {
      key: 'totalGross',
      header: t('invoices.list.col.total'),
      align: 'right',
      numeric: true,
      cell: (item) => (
        <span className="font-semibold tabular-nums">
          {formatInvoiceListAmount(locale, item.totalGross, item.currency)}
        </span>
      ),
    },
    {
      key: 'outstandingAmount',
      header: t('invoices.list.col.outstanding'),
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
          {formatInvoiceListAmount(locale, item.outstandingAmount, item.currency)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('invoices.list.col.status'),
      cell: (item) => {
        const st = invoiceListStatusStyle(item.status);
        return (
          <StatusChip tone={item.isOverdue ? 'critical' : 'neutral'} dot className="text-[11px]">
            <span className={st.text}>{labelInvoiceListStatus(locale, item.status)}</span>
          </StatusChip>
        );
      },
    },
    {
      key: 'documentStatus',
      header: t('invoices.list.col.document'),
      cell: (item) => (
        <StatusChip tone={documentStatusTone(item.documentStatus)} className="text-[10px]">
          {documentStatusLabel(locale, item.documentStatus)}
        </StatusChip>
      ),
    },
    {
      key: 'lastSendStatus',
      header: t('invoices.list.col.send'),
      cell: (item) => (
        <StatusChip tone={sendStatusTone(item.lastSendStatus)} className="text-[10px]">
          {sendStatusLabel(locale, item.lastSendStatus)}
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
        getRowTestId={(item) => `invoice-list-item-${item.invoiceNumber}`}
        loading={loading}
        skeletonRows={8}
        dense
        onRowClick={onSelect}
        getRowClassName={(item) => (item.isOverdue ? 'bg-status-critical-soft/20' : undefined)}
        empty={t('invoices.list.table.empty')}
      />
    </div>
  );
}
