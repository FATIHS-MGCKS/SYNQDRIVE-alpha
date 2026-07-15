import { BillingInvoiceSection } from './BillingInvoiceSection';
import type { BillingInvoiceDto } from '../../types/billing.types';
import type { BillingInvoicesQuery } from './useBillingInvoices';
import type { BillingPaginatedMeta } from './billing-query.utils';

interface TenantBillingInvoicesTabProps {
  invoices: BillingInvoiceDto[];
  loading: boolean;
  error: string | null;
  meta: BillingPaginatedMeta | null;
  query: BillingInvoicesQuery;
  onQueryChange: (query: BillingInvoicesQuery) => void;
  onRetry: () => void;
}

export function TenantBillingInvoicesTab(props: TenantBillingInvoicesTabProps) {
  return (
    <div data-testid="tenant-invoices-tab">
      <BillingInvoiceSection {...props} />
    </div>
  );
}
