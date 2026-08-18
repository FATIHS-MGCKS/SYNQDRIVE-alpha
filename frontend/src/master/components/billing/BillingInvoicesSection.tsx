import { BillingInvoicesTab } from './BillingInvoicesTab';

export function BillingInvoicesSection() {
  return (
    <div className="space-y-4" data-testid="master-billing-invoices-section">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">Rechnungen</h2>
        <p className="text-[12px] text-muted-foreground mt-1 max-w-3xl">
          Cross-Organisation Rechnungen — Zahlungskontext und Vertragsbezug im Detail.
        </p>
      </div>
      <BillingInvoicesTab />
    </div>
  );
}
