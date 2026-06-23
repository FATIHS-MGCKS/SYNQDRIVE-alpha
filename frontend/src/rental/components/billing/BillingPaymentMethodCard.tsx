import type { BillingSummaryDto } from '../../types/billing.types';
import { paymentMethodLabel } from './billing.utils';
import { Icon } from '../ui/Icon';

interface BillingPaymentMethodCardProps {
  paymentMethod: BillingSummaryDto['paymentMethod'];
  stripePortalPrepared?: boolean;
}

export function BillingPaymentMethodCard({
  paymentMethod,
  stripePortalPrepared = true,
}: BillingPaymentMethodCardProps) {
  const pm = paymentMethod;
  const isError =
    pm.exists &&
    pm.status &&
    ['FAILED', 'REQUIRES_ACTION', 'EXPIRED'].includes(pm.status);

  return (
    <div className="sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Zahlungsmethode
          </h3>
          <p className="text-[11px] mt-0.5 text-muted-foreground">
            Nur Stripe-Metadaten — keine Kartendaten im System gespeichert.
          </p>
        </div>
        {pm.exists && pm.status && (
          <span
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${
              isError ? 'sq-tone-critical' : 'sq-tone-success'
            }`}
          >
            {pm.status}
          </span>
        )}
      </div>

      {!pm.exists ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-5 text-center">
          <div className="sq-tone-neutral w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center">
            <Icon name="credit-card" className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">Keine Zahlungsmethode hinterlegt</p>
          <p className="text-[11px] mt-1 text-muted-foreground max-w-sm mx-auto">
            Stripe-Zahlungsportal wird vorbereitet. Es werden keine Fake-Zahlungsdaten angezeigt.
          </p>
          <button
            type="button"
            disabled={stripePortalPrepared}
            title={stripePortalPrepared ? 'Stripe-Zahlungsportal wird vorbereitet.' : undefined}
            className={`mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-border/70 ${
              stripePortalPrepared
                ? 'text-muted-foreground cursor-not-allowed'
                : 'text-[var(--brand)] hover:bg-[var(--brand-soft)]'
            }`}
          >
            Zahlungsmethode hinzufügen
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs text-muted-foreground">{paymentMethodLabel(pm.type)}</p>
            <p className="mt-1 text-lg font-semibold tracking-[-0.02em] text-foreground">
              {pm.brand ?? 'Karte'} {pm.last4 ? `•••• ${pm.last4}` : ''}
            </p>
            {pm.expMonth && pm.expYear && (
              <p className="text-[11px] mt-1 text-muted-foreground">
                Gültig bis {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
              </p>
            )}
          </div>
          {isError && (
            <p className="text-xs sq-tone-critical rounded-lg px-3 py-2">
              Die hinterlegte Zahlungsmethode erfordert eine Aktualisierung.
            </p>
          )}
          <button
            type="button"
            disabled={stripePortalPrepared}
            title={stripePortalPrepared ? 'Stripe-Zahlungsportal wird vorbereitet.' : undefined}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border border-border/70 ${
              stripePortalPrepared
                ? 'text-muted-foreground cursor-not-allowed'
                : 'text-[var(--brand)] hover:bg-[var(--brand-soft)]'
            }`}
          >
            Zahlungsmethode ändern
          </button>
        </div>
      )}
    </div>
  );
}
