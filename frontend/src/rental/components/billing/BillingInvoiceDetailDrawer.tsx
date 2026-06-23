import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import type { BillingInvoiceDto } from '../../types/billing.types';
import {
  formatDateDe,
  formatMoneyCents,
  invoiceStatusLabel,
  invoiceStatusTone,
} from './billing.utils';
import { Icon } from '../ui/Icon';

interface BillingInvoiceDetailDrawerProps {
  invoice: BillingInvoiceDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingInvoiceDetailDrawer({
  invoice,
  open,
  onOpenChange,
}: BillingInvoiceDetailDrawerProps) {
  if (!invoice) return null;

  const currency = (invoice.currency ?? 'eur').toUpperCase();
  const gross =
    invoice.grossAmountCents ??
    invoice.amountCents ??
    (typeof invoice.amount === 'number' ? Math.round(invoice.amount * 100) : null);
  const lines = invoice.invoiceLines ?? [];
  const statusRaw = invoice.displayStatus ?? invoice.status;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechnung ${invoice.stripeInvoiceId ?? invoice.id.slice(0, 8)}`}
      description="Detailansicht mit Positionen und Nutzungskontext."
      status={
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceStatusTone(statusRaw)}`}>
          {invoiceStatusLabel(statusRaw)}
        </span>
      }
      widthClassName="sm:max-w-lg"
      footer={
        invoice.invoicePdfUrl ? (
          <a
            href={invoice.invoicePdfUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white hover:opacity-90 transition-opacity"
          >
            <Icon name="download" className="w-4 h-4" />
            PDF herunterladen
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="Kein PDF verfügbar"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-border/70 text-muted-foreground cursor-not-allowed"
          >
            Kein PDF verfügbar
          </button>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Zeitraum</p>
            <p className="font-semibold mt-0.5">
              {formatDateDe(invoice.periodStart)} – {formatDateDe(invoice.periodEnd)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Ausgestellt</p>
            <p className="font-semibold mt-0.5">{formatDateDe(invoice.invoiceDate ?? invoice.date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Netto</p>
            <p className="font-semibold mt-0.5 tabular-nums">
              {formatMoneyCents(invoice.netAmountCents ?? gross, currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Brutto</p>
            <p className="font-semibold mt-0.5 tabular-nums">{formatMoneyCents(gross, currency)}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Positionen
          </p>
          {lines.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/70 p-3">
              Für diese Rechnung sind keine detaillierten Positionen hinterlegt (Legacy-Rechnung).
            </p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="rounded-xl border border-border/60 p-3">
                  <p className="text-xs font-semibold text-foreground">{line.description}</p>
                  <p className="text-[11px] mt-1 text-muted-foreground">
                    {line.quantity} × {formatMoneyCents(line.unitAmountCents, currency)} ={' '}
                    {formatMoneyCents(line.subtotalCents, currency)}
                  </p>
                  {line.usageSnapshot && (
                    <p className="text-[10px] mt-2 text-muted-foreground">
                      {line.usageSnapshot.billableVehicleCount} Fahrzeuge ·{' '}
                      {formatDateDe(line.usageSnapshot.periodStart)} –{' '}
                      {formatDateDe(line.usageSnapshot.periodEnd)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DetailDrawer>
  );
}
