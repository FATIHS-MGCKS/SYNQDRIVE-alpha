import { ChevronRight } from 'lucide-react';

import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
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

interface InvoiceListMobileCardsProps {
  items: InvoiceListItem[];
  onSelect: (item: InvoiceListItem) => void;
  className?: string;
}

export function InvoiceListMobileCards({ items, onSelect, className }: InvoiceListMobileCardsProps) {
  const { locale, t } = useLanguage();
  const empty = t('invoices.list.emptyValue');

  return (
    <div className={cn('space-y-2.5 md:hidden', className)}>
      {items.map((item) => {
        const status = invoiceListStatusStyle(item.status);
        const party = counterpartyDisplayName(item, locale);
        const vehicle = vehicleDisplayLine(item, locale);

        return (
          <button
            key={item.id}
            type="button"
            data-testid={`invoice-list-item-${item.invoiceNumber}`}
            onClick={() => onSelect(item)}
            className={cn(
              'surface-premium w-full rounded-xl p-3.5 text-left shadow-[var(--shadow-1)] transition-colors',
              'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item.isOverdue && 'border-l-2 border-l-status-critical',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-brand tabular-nums">{item.invoiceNumber}</p>
                <p className="mt-0.5 truncate text-[12px] font-semibold text-foreground">{party}</p>
              </div>
              <StatusChip tone={item.isOverdue ? 'critical' : 'neutral'} className="shrink-0">
                <span className={cn('inline-flex items-center gap-1', status.text)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                  {labelInvoiceListStatus(locale, item.status)}
                </span>
              </StatusChip>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <p className="text-muted-foreground">{t('invoices.list.col.total')}</p>
                <p className="font-semibold tabular-nums text-foreground">
                  {formatInvoiceListAmount(locale, item.totalGross, item.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('invoices.list.col.outstanding')}</p>
                <p
                  className={cn(
                    'font-semibold tabular-nums',
                    item.outstandingAmount > 0 ? 'text-status-watch' : 'text-foreground',
                  )}
                >
                  {formatInvoiceListAmount(locale, item.outstandingAmount, item.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('invoices.list.col.dueDate')}</p>
                <p className={cn('font-medium tabular-nums', item.isOverdue && 'text-status-critical')}>
                  {formatInvoiceListDate(locale, item.dueDate)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{t('invoices.list.col.booking')}</p>
                <p className="truncate font-medium text-foreground">{item.bookingNumber || empty}</p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <StatusChip tone={documentStatusTone(item.documentStatus)} className="text-[10px]">
                {documentStatusLabel(locale, item.documentStatus)}
              </StatusChip>
              <StatusChip tone={sendStatusTone(item.lastSendStatus)} className="text-[10px]">
                {sendStatusLabel(locale, item.lastSendStatus)}
              </StatusChip>
              {vehicle !== empty && (
                <span className="truncate text-[10px] text-muted-foreground">{vehicle}</span>
              )}
            </div>

            <div className="mt-2 flex items-center justify-end text-[10px] font-medium text-muted-foreground">
              {t('invoices.list.mobile.details')}
              <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden />
            </div>
          </button>
        );
      })}
    </div>
  );
}
