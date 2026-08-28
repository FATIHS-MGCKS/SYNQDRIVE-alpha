import { Button } from '../../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TenantPaymentMethodDto } from '../../types/billing.types';
import {
  formatPaymentMethodDisplayLocalized,
  resolvePaymentMethodBillingStateLabel,
} from '../../lib/rental-tenant-billing-i18n';
import type { BillingStripeUiState } from './billing-stripe-ui';
import {
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
  const { t } = useLanguage();
  const defaultMethod = paymentMethods.find((method) => method.isDefault) ?? null;

  return (
    <div className="space-y-4" data-testid="tenant-payment-methods-section">
      <div className="surface-premium rounded-2xl p-4 sm:p-5 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {t('tenantBilling.paymentMethod.section.title')}
            </h3>
            <p className="text-[12px] mt-0.5 text-muted-foreground">
              {t('tenantBilling.paymentMethod.section.subtitle')}
            </p>
          </div>
          {defaultMethod ? (
            <span className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-brand">
              {t('tenantBilling.paymentMethod.header.defaultConfigured')}
            </span>
          ) : null}
        </div>

        {stripeState === 'not_configured' ? (
          <div
            className={`rounded-xl border border-border/60 px-3.5 py-3 mb-4 text-[12px] ${stripeStateTone(stripeState)}`}
          >
            <p className="font-semibold">{stripeStateLabel(stripeState, t)}</p>
            <p className="mt-1 text-muted-foreground">{stripeStateHint(stripeState, t)}</p>
          </div>
        ) : null}

        {paymentMethods.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-5 text-center">
            <div className="sq-tone-neutral w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center">
              <Icon name="credit-card" className="w-5 h-5" />
            </div>
            <p className="text-[13px] font-semibold">{t('tenantBilling.paymentMethod.empty.title')}</p>
            <p className="text-[12px] mt-1 text-muted-foreground max-w-sm mx-auto">
              {t('tenantBilling.paymentMethod.empty.body')}
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
                {portalLoading
                  ? t('common.loading')
                  : t('tenantBilling.paymentMethod.action.add')}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {paymentMethods.map((method) => {
              const display = formatPaymentMethodDisplayLocalized(method, t);
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
                          {t('tenantBilling.paymentMethod.badge.default')}
                        </span>
                      ) : null}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${paymentMethodBillingStateTone(method.billingState)}`}
                      >
                        {resolvePaymentMethodBillingStateLabel(method.billingState, t)}
                      </span>
                    </div>
                    <p className="text-[12px] text-muted-foreground mt-1">{display.subtitle}</p>
                    {display.detail ? (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{display.detail}</p>
                    ) : null}
                    {needsAttention ? (
                      <p className="text-[11px] sq-tone-warning mt-2">
                        {t('tenantBilling.paymentMethod.attention.updateRequired')}
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
                          {t('tenantBilling.paymentMethod.action.setDefault')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={loadingId === method.id || (method.isDefault && paymentMethods.length === 1)}
                        onClick={() => onDetach(method.id)}
                      >
                        {t('common.remove')}
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
              {portalLoading ? t('common.loading') : t('tenantBilling.paymentMethod.action.add')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={portalLoading}
              onClick={onOpenPortal}
            >
              {portalLoading ? t('common.loading') : t('tenantBilling.problem.openPortal')}
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
