import type { Invoice } from './invoiceTypes';
import { displayNumber, isOutgoing } from './invoiceFormatters';
import type { InvoiceDirectionFilter } from './invoiceConstants';

export function filterInvoices(
  invoices: Invoice[],
  searchTerm: string,
  statusFilter: string,
  directionFilter: InvoiceDirectionFilter,
): Invoice[] {
  return invoices.filter((inv) => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (
        !inv.title.toLowerCase().includes(q) &&
        !displayNumber(inv).toLowerCase().includes(q) &&
        !(inv.vendorName || '').toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (statusFilter !== 'all' && inv.status !== statusFilter) return false;
    if (directionFilter === 'outgoing' && !isOutgoing(inv.type)) return false;
    if (directionFilter === 'incoming' && isOutgoing(inv.type)) return false;
    return true;
  });
}

export function countInvoicesByStatus(invoices: Invoice[], status: string): number {
  return status === 'all' ? invoices.length : invoices.filter((inv) => inv.status === status).length;
}

export function countInvoicesByDirection(
  invoices: Invoice[],
  direction: InvoiceDirectionFilter,
): number {
  if (direction === 'all') return invoices.length;
  if (direction === 'outgoing') return invoices.filter((inv) => isOutgoing(inv.type)).length;
  return invoices.filter((inv) => !isOutgoing(inv.type)).length;
}
