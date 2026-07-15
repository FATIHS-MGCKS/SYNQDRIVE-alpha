import type { BillingSummaryDto } from '../../types/billing.types';
import { Button } from '../../../components/ui/button';
import { paymentMethodLabel, paymentMethodStatusLabel } from './billing.utils';
import {
  stripeStateHint,
  stripeStateLabel,
  stripeStateTone,
  type BillingStripeUiState,
} from './billing-stripe-ui';
import { Icon } from '../ui/Icon';

interface BillingPaymentMethodCardProps {
  paymentMethod: BillingSummaryDto['paymentMethod'];
  stripeState: BillingStripeUiState;
  canUseStripePayments: boolean;
  onOpenPortal: () => void;
  portalLoading?: boolean;
  portalError?: string | null;
}

export function BillingPaymentMethodCard({
  paymentMethod,
  stripeState,
  canUseStripePayments,
  onOpenPortal,
  portalLoading = false,
  portalError = null,
}: BillingPaymentMethodCardProps) {
  const pm = paymentMethod;
  const isError =
    pm.exists &&
    pm.status &&
    ['FAILED', 'REQUIRES_ACTION', 'EXPIRED'].includes(pm.status);

  const portalButtonLabel = pm.exists ? 'Zahlungsmethode verwalten' : 'Zahlungsmethode hinzufügen';

  return (
    <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            Zahlungsmethode
          </h3>
          <p className="text-[12px] mt-0.5 text-muted-foreground">
            Nur sichere Zahlungsdaten — Kartendetails werden nicht im System gespeichert.
          </p>
        </div>
        {pm.exists && pm.status && (
          <span
            className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold ${
              isError ? 'sq-tone-critical' : 'sq-tone-success'
            }`}
          >
            {paymentMethodStatusLabel(pm.status)}
          </span>
        )}
      </div>

      {stripeState === 'not_configured' && (
        <div
          className={`rounded-xl border border-border/60 px-3.5 py-3 mb-4 text-[12px] ${stripeStateTone(stripeState)}`}
        >
          <p className="font-semibold">{stripeStateLabel(stripeState)}</p>
          <p className="mt-1 text-muted-foreground">{stripeStateHint(stripeState)}</p>
        </div>
      )}

      {!pm.exists ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-5 text-center">
          <div className="sq-tone-neutral w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center">
            <Icon name="credit-card" className="w-5 h-5" />
          </div>
          <p className="text-[13px] font-semibold text-foreground">
            Keine Zahlungsmethode hinterlegt
          </p>
          <p className="text-[12px] mt-1 text-muted-foreground max-w-sm mx-auto">
            {stripeState === 'configured'
              ? 'Hinterlegen Sie eine Zahlungsmethode im sicheren Kundenbereich.'
              : stripeState === 'prepared'
                ? 'Die Online-Zahlung wird vorbereitet. Bitte später erneut versuchen.'
                : 'Online-Zahlungen sind für diese Organisation noch nicht freigeschaltet.'}
          </p>
          {canUseStripePayments ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="mt-4"
              disabled={portalLoading}
              onClick={onOpenPortal}
            >
              {portalLoading ? 'Wird geöffnet…' : 'Zahlungsmethode hinzufügen'}
            </Button>
          ) : stripeState === 'prepared' ? (
            <Button type="button" variant="outline" size="sm" className="mt-4" disabled>
              Online-Zahlung wird vorbereitet
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12px] text-muted-foreground">{paymentMethodLabel(pm.type)}</p>
              <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-brand">
                Standard
              </span>
            </div>
            <p className="mt-1 text-[22px] font-semibold tracking-[-0.02em] text-foreground leading-tight">
              {pm.brand ?? 'Karte'} {pm.last4 ? `•••• ${pm.last4}` : ''}
            </p>
            {pm.expMonth && pm.expYear && (
              <p className="text-[12px] mt-1 text-muted-foreground">
                Gültig bis {String(pm.expMonth).padStart(2, '0')}/{pm.expYear}
              </p>
            )}
          </div>
          {isError && (
            <p className="text-[12px] sq-tone-critical rounded-lg px-3 py-2">
              Die hinterlegte Zahlungsmethode erfordert eine Aktualisierung.
            </p>
          )}
          {canUseStripePayments ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={portalLoading}
              onClick={onOpenPortal}
            >
              {portalLoading ? 'Wird geöffnet…' : portalButtonLabel}
            </Button>
          ) : stripeState === 'prepared' ? (
            <Button type="button" variant="outline" size="sm" disabled>
              Online-Zahlung wird vorbereitet
            </Button>
          ) : null}
        </div>
      )}

      {portalError && (
        <p className="mt-3 text-[12px] text-destructive" role="alert">
          {portalError}
        </p>
      )}
    </div>
  );
}
