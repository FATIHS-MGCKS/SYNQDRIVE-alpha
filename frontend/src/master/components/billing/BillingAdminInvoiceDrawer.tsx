import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import type { AdminBillingInvoiceDto } from '../../types/admin-billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  invoiceStatusLabel,
  invoiceStatusTone,
} from './admin-billing.utils';

interface BillingAdminInvoiceDrawerProps {
  invoice: AdminBillingInvoiceDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingAdminInvoiceDrawer({
  invoice,
  open,
  onOpenChange,
}: BillingAdminInvoiceDrawerProps) {
  if (!invoice) return null;

  const currency = (invoice.currency ?? 'EUR').toUpperCase();
  const gross = invoice.grossAmountCents ?? invoice.amountCents;
  const lines = invoice.invoiceLines ?? invoice.lines ?? [];

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechnung ${invoice.stripeInvoiceId ?? invoice.id.slice(0, 8)}`}
      description={invoice.subscription?.organization.companyName}
      status={
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceStatusTone(invoice.status)}`}>
          {invoiceStatusLabel(invoice.status)}
        </span>
      }
      footer={
        invoice.invoicePdfUrl ? (
          <a
            href={invoice.invoicePdfUrl}
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white"
          >
            PDF herunterladen
          </a>
        ) : undefined
      }
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-muted-foreground">Zeitraum</p>
            <p className="font-semibold mt-0.5">
              {formatDateDe(invoice.periodStart)} – {formatDateDe(invoice.periodEnd)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Stripe ID</p>
            <p className="font-mono mt-0.5">{invoice.stripeInvoiceId ?? '—'}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Netto</p>
            <p className="font-semibold tabular-nums mt-0.5">
              {formatMoneyCents(invoice.netAmountCents ?? gross, currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Brutto</p>
            <p className="font-semibold tabular-nums mt-0.5">{formatMoneyCents(gross, currency)}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Positionen
          </p>
          {lines.length === 0 ? (
            <p className="text-muted-foreground border border-dashed border-border/70 rounded-lg p-3">
              Keine Line Items (Legacy-Rechnung).
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="rounded-xl border border-border/60 p-3">
                  <p className="font-semibold">{line.description}</p>
                  <p className="text-muted-foreground mt-1">
                    {line.quantity} × {formatMoneyCents(line.unitAmountCents, currency)} ={' '}
                    {formatMoneyCents(line.subtotalCents, currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DetailDrawer>
  );
}
