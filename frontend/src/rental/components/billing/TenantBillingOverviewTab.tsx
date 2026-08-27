import { Button } from '../../../components/ui/button';
import { EmptyState, ErrorState, SkeletonCard } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TenantInvoiceListItemDto, TenantSubscriptionOverviewDto } from '../../types/billing.types';
import { formatDateDe } from './billing.utils';
import {
  nextAmountLabel,
  paymentMethodSummaryLabel,
  pricingModelDisplayLabel,
  resolveInvoiceNumberLabel,
  warningTone,
} from './tenant-billing-overview.utils';

interface TenantBillingOverviewTabProps {
  overview: TenantSubscriptionOverviewDto | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  lastPaidInvoice: TenantInvoiceListItemDto | null;
  lastPaidInvoiceLoading: boolean;
  lastPaidInvoiceError: string | null;
  canWrite?: boolean;
  onManagePaymentMethod?: () => void;
  onViewInvoices?: () => void;
  onOpenPortal?: () => void;
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 px-3.5 py-3 min-w-0">
      <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-[18px] sm:text-[20px] font-semibold tracking-[-0.02em] text-foreground tabular-nums truncate leading-tight">
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">{hint}</p> : null}
    </div>
  );
}

export function TenantBillingOverviewTab({
  overview,
  loading,
  error,
  onRetry,
  lastPaidInvoice,
  lastPaidInvoiceLoading,
  lastPaidInvoiceError,
  canWrite = false,
  onManagePaymentMethod,
  onViewInvoices,
  onOpenPortal,
}: TenantBillingOverviewTabProps) {
  const { t, locale } = useLanguage();

  if (loading && !overview) {
    return (
      <div className="space-y-3" data-testid="tenant-overview-loading">
        <SkeletonCard className="h-24 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <SkeletonCard className="h-20 rounded-xl" />
          <SkeletonCard className="h-20 rounded-xl" />
          <SkeletonCard className="h-20 rounded-xl" />
        </div>
        <SkeletonCard className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title={t('tenantBilling.overview.loadError')}
        description={error}
        onRetry={() => void onRetry()}
        retryLabel={t('common.retry')}
      />
    );
  }

  if (!overview?.contract) {
    return <EmptyState title={t('tenantBilling.overview.emptyTitle')} />;
  }

  const contract = overview.contract;
  const pricing = overview.pricing;

  return (
    <div className="space-y-4" data-testid="tenant-billing-overview-tab">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <MetricCard label={t('tenantBilling.overview.currentPlan')} value={overview.plan?.name ?? 'SynqDrive'} />
        <MetricCard label={t('tenantBilling.overview.contractStatus')} value={contract.statusLabel} />
        <MetricCard
          label={t('tenantBilling.overview.billableVehicles')}
          value={String(pricing?.billableVehicleCount ?? 0)}
          hint={t('tenantBilling.overview.connectedHint', {
            count: pricing?.connectedVehicleCount ?? 0,
          })}
        />
        <MetricCard label={t('tenantBilling.overview.nextAmount')} value={nextAmountLabel(overview)} />
        <MetricCard
          label={t('tenantBilling.overview.nextCharge')}
          value={formatDateDe(overview.billing?.nextChargeAt, locale)}
        />
        <MetricCard
          label={t('tenantBilling.tab.paymentMethod')}
          value={paymentMethodSummaryLabel(overview)}
        />
      </div>

      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5 space-y-4">
        <h3 className="text-sm font-semibold">{t('tenantBilling.overview.breakdownTitle')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <span className="text-muted-foreground">{t('tenantBilling.overview.rowBase')}</span>
            <span className="font-medium tabular-nums">
              {pricing?.baseAmount?.formatted ?? '—'}
            </span>
          </div>
          {(pricing?.discounts ?? []).map((discount, index) => (
            <div key={`${discount.label}-${index}`} className="flex justify-between gap-3 border-b border-border/40 pb-2">
              <span className="text-muted-foreground">{discount.label}</span>
              <span className="font-medium tabular-nums">−{discount.amount.formatted}</span>
            </div>
          ))}
          <div className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <span className="text-muted-foreground">{t('invoiceLineItem.summary.net')}</span>
            <span className="font-medium tabular-nums">{pricing?.netAmount?.formatted ?? '—'}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-border/40 pb-2">
            <span className="text-muted-foreground">{t('invoiceLineItem.summary.tax')}</span>
            <span className="font-medium tabular-nums">
              {pricing?.taxConfigured ? pricing.taxAmount?.formatted ?? '—' : t('tenantBilling.overview.taxMissing')}
            </span>
          </div>
          <div className="flex justify-between gap-3 sm:col-span-2">
            <span className="text-muted-foreground font-semibold">{t('invoiceLineItem.summary.gross')}</span>
            <span className="font-semibold tabular-nums">{pricing?.grossAmount?.formatted ?? '—'}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">{t('tenantBilling.overview.pricingTier')}</p>
            <p className="font-semibold mt-0.5">{pricing?.appliedTier?.label ?? '—'}</p>
            {pricing?.appliedTier?.unitPrice ? (
              <p className="text-muted-foreground mt-0.5">
                {pricing.appliedTier.unitPrice.formatted} ·{' '}
                {pricingModelDisplayLabel(pricing.pricingModel, t)}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-muted-foreground">{t('tenantBilling.overview.contractPeriod')}</p>
            <p className="font-semibold mt-0.5">
              {formatDateDe(contract.currentPeriodStart, locale)} –{' '}
              {formatDateDe(contract.currentPeriodEnd, locale)}
            </p>
            <p className="text-muted-foreground mt-0.5">{contract.billingIntervalLabel}</p>
          </div>
        </div>
      </div>

      {overview.warnings.length > 0 ? (
        <div className="space-y-2">
          {overview.warnings.map((warning, index) => (
            <div
              key={`${warning.message}-${index}`}
              className={`rounded-xl border border-border/60 px-3.5 py-3 text-xs ${warningTone(warning.severity)}`}
            >
              <p className="font-semibold">{warning.message}</p>
              {warning.actionHint ? (
                <p className="mt-1 text-muted-foreground">{warning.actionHint}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="surface-premium rounded-2xl border border-border/60 p-4 sm:p-5 space-y-2">
        <h3 className="text-sm font-semibold">{t('tenantBilling.overview.lastPaidTitle')}</h3>
        {lastPaidInvoiceLoading ? (
          <p className="text-xs text-muted-foreground">{t('common.loading')}</p>
        ) : lastPaidInvoiceError ? (
          <p className="text-xs sq-tone-warning px-2 py-1 rounded">{lastPaidInvoiceError}</p>
        ) : lastPaidInvoice ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-semibold">{resolveInvoiceNumberLabel(lastPaidInvoice, t)}</p>
              <p className="text-muted-foreground mt-0.5">
                {formatDateDe(lastPaidInvoice.paidAt ?? lastPaidInvoice.invoiceDate, locale)} ·{' '}
                {lastPaidInvoice.grossAmount?.formatted ?? '—'}
              </p>
            </div>
            {onViewInvoices ? (
              <Button type="button" size="sm" variant="outline" onClick={onViewInvoices}>
                {t('tenantBilling.overview.viewInvoices')}
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t('common.noData')}</p>
        )}
      </div>

      {overview.availableActions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {overview.availableActions.map((action) => {
            if (action.requiresWritePermission && !canWrite) {
              return null;
            }
            if (action.action === 'VIEW_INVOICES' && onViewInvoices) {
              return (
                <Button key={action.action} type="button" size="sm" variant="outline" onClick={onViewInvoices}>
                  {action.label}
                </Button>
              );
            }
            if (
              (action.action === 'ADD_PAYMENT_METHOD' ||
                action.action === 'MANAGE_PAYMENT_METHOD' ||
                action.action === 'UPDATE_PAYMENT_METHOD') &&
              onManagePaymentMethod
            ) {
              return (
                <Button
                  key={action.action}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onManagePaymentMethod}
                >
                  {action.label}
                </Button>
              );
            }
            if (action.action === 'OPEN_CUSTOMER_PORTAL' && onOpenPortal) {
              return (
                <Button
                  key={action.action}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onOpenPortal}
                >
                  {action.label}
                </Button>
              );
            }
            return null;
          })}
        </div>
      ) : null}

      {overview.sectionErrors.length > 0 ? (
        <div className="space-y-2">
          {overview.sectionErrors.map((sectionError) => (
            <p key={`${sectionError.section}-${sectionError.message}`} className="text-xs sq-tone-warning px-2 py-1 rounded">
              {sectionError.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
