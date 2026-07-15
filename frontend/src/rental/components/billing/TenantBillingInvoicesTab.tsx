import { TenantInvoicesSection } from './TenantInvoicesSection';
import type { TenantInvoiceListItemDto } from '../../types/billing.types';
import type { BillingInvoicesQuery } from './useBillingInvoices';
import type { BillingPaginatedMeta } from './billing-query.utils';

interface TenantBillingInvoicesTabProps {
  orgId: string | undefined;
  invoices: TenantInvoiceListItemDto[];
  loading: boolean;
  error: string | null;
  meta: BillingPaginatedMeta | null;
  query: BillingInvoicesQuery;
  onQueryChange: (query: BillingInvoicesQuery) => void;
  onRetry: () => void;
  canWrite: boolean;
  onManagePaymentMethod?: () => void;
}

export function TenantBillingInvoicesTab(props: TenantBillingInvoicesTabProps) {
  return (
    <div data-testid="tenant-invoices-tab">
      <TenantInvoicesSection {...props} />
    </div>
  );
}
