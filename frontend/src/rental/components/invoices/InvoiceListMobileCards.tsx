import { ChevronRight } from 'lucide-react';

import { StatusChip } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
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

interface InvoiceListMobileCardsProps {
  items: InvoiceListItem[];
  onSelect: (item: InvoiceListItem) => void;
  className?: string;
}

export function InvoiceListMobileCards({ items, onSelect, className }: InvoiceListMobileCardsProps) {
  return (
    <div className={cn('space-y-2.5 md:hidden', className)}>
      {items.map((item) => {
        const status = STATUS_MAP[item.status] || STATUS_MAP.DRAFT;
        const party = counterpartyDisplayName(item);
        const vehicle = vehicleDisplayLine(item);

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
                  {status.label}
                </span>
              </StatusChip>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <p className="text-muted-foreground">Gesamt</p>
                <p className="font-semibold tabular-nums text-foreground">
                  {formatAmount(item.totalGross, item.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Offen</p>
                <p
                  className={cn(
                    'font-semibold tabular-nums',
                    item.outstandingAmount > 0 ? 'text-status-watch' : 'text-foreground',
                  )}
                >
                  {formatAmount(item.outstandingAmount, item.currency)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Fällig</p>
                <p className={cn('font-medium tabular-nums', item.isOverdue && 'text-status-critical')}>
                  {formatDate(item.dueDate)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Buchung</p>
                <p className="truncate font-medium text-foreground">{item.bookingNumber || '—'}</p>
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <StatusChip tone={documentStatusTone(item.documentStatus)} className="text-[10px]">
                {documentStatusLabelDe(item.documentStatus)}
              </StatusChip>
              <StatusChip tone={sendStatusTone(item.lastSendStatus)} className="text-[10px]">
                {sendStatusLabelDe(item.lastSendStatus)}
              </StatusChip>
              {vehicle !== '—' && (
                <span className="truncate text-[10px] text-muted-foreground">{vehicle}</span>
              )}
            </div>

            <div className="mt-2 flex items-center justify-end text-[10px] font-medium text-muted-foreground">
              Details
              <ChevronRight className="ml-0.5 h-3.5 w-3.5" aria-hidden />
            </div>
          </button>
        );
      })}
    </div>
  );
}
