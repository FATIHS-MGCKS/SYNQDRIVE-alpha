import { Button } from '../../../components/ui/button';
import type { TenantPaymentMethodDto } from '../../types/billing.types';
import type { BillingStripeUiState } from './billing-stripe-ui';
import {
  formatPaymentMethodDisplay,
  paymentMethodBillingStateLabel,
  paymentMethodBillingStateTone,
  paymentMethodNeedsAttention,
} from './tenant-payment-methods.utils';
import {
  stripeStateHint,
  stripeStateLabel,
  stripeStateTone,
} from './billing-stripe-ui';
import { Icon } from '../ui/Icon';

interface TenantPaymentMethodsSectionProps {
  paymentMethods: TenantPaymentMethodDto[];
  stripeState: BillingStripeUiState;
  canUseStripePayments: boolean;
  canWrite: boolean;
  loadingId: string | null;
  actionError: string | null;
  portalLoading: boolean;
  portalError: string | null;
  onOpenPortal: () => void;
  onSetDefault: (paymentMethodId: string) => void;
  onDetach: (paymentMethodId: string) => void;
}

export function TenantPaymentMethodsSection({
  paymentMethods,
  stripeState,
  canUseStripePayments,
  canWrite,
  loadingId,
  actionError,
  portalLoading,
  portalError,
  onOpenPortal,
  onSetDefault,
  onDetach,
}: TenantPaymentMethodsSectionProps) {
  const defaultMethod = paymentMethods.find((method) => method.isDefault) ?? null;

  return (
    <div className="space-y-4" data-testid="tenant-payment-methods-section">
      <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              Zahlungsmethoden
            </h3>
            <p className="text-[12px] mt-0.5 text-muted-foreground">
              Verwalten Sie Karte oder SEPA-Lastschrift für Ihr SynqDrive-Abo.
            </p>
          </div>
          {defaultMethod ? (
            <span className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-brand">
              Standard hinterlegt
            </span>
          ) : null}
        </div>

        {stripeState === 'not_configured' ? (
          <div
            className={`rounded-xl border border-border/60 px-3.5 py-3 mb-4 text-[12px] ${stripeStateTone(stripeState)}`}
          >
            <p className="font-semibold">{stripeStateLabel(stripeState)}</p>
            <p className="mt-1 text-muted-foreground">{stripeStateHint(stripeState)}</p>
          </div>
        ) : null}

        {paymentMethods.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-5 text-center">
            <div className="sq-tone-neutral w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center">
              <Icon name="credit-card" className="w-5 h-5" />
            </div>
            <p className="text-[13px] font-semibold">Keine Zahlungsmethode hinterlegt</p>
            <p className="text-[12px] mt-1 text-muted-foreground max-w-sm mx-auto">
              Hinterlegen Sie eine Zahlungsmethode im sicheren Kundenbereich.
            </p>
            {canWrite && canUseStripePayments ? (
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
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => {
              const display = formatPaymentMethodDisplay(method);
              const needsAttention = paymentMethodNeedsAttention(method);
              return (
                <div
                  key={method.id}
                  className="rounded-xl border border-border/70 bg-muted/15 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                  data-testid={`tenant-payment-method-${method.type.toLowerCase()}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold truncate">{display.title}</p>
                      {method.isDefault ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold sq-tone-brand">
                          Standard
                        </span>
                      ) : null}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${paymentMethodBillingStateTone(method.billingState)}`}
                      >
                        {paymentMethodBillingStateLabel(method.billingState)}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-1">{display.subtitle}</p>
                    {display.detail ? (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{display.detail}</p>
                    ) : null}
                    {needsAttention ? (
                      <p className="text-[11px] sq-tone-warning mt-2">
                        Diese Zahlungsmethode erfordert eine Aktualisierung.
                      </p>
                    ) : null}
                  </div>

                  {canWrite && canUseStripePayments ? (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {!method.isDefault ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={loadingId === method.id}
                          onClick={() => onSetDefault(method.id)}
                        >
                          Als Standard setzen
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={loadingId === method.id || (method.isDefault && paymentMethods.length === 1)}
                        onClick={() => onDetach(method.id)}
                      >
                        Entfernen
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {canWrite && canUseStripePayments && paymentMethods.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={portalLoading}
              onClick={onOpenPortal}
            >
              {portalLoading ? 'Wird geöffnet…' : 'Zahlungsmethode hinzufügen'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={portalLoading}
              onClick={onOpenPortal}
            >
              {portalLoading ? 'Wird geöffnet…' : 'Kundenportal öffnen'}
            </Button>
          </div>
        ) : null}

        {actionError ? (
          <p className="mt-3 text-[12px] text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}
        {portalError ? (
          <p className="mt-3 text-[12px] text-destructive" role="alert">
            {portalError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
