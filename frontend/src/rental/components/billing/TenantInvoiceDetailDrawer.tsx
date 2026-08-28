import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { Button } from '../../../components/ui/button';
import { ErrorState } from '../../../components/patterns/states';
import type { TenantInvoiceListItemDto } from '../../types/billing.types';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatRentalTenantBillingDate,
  resolveTenantInvoiceMachineStatus,
  resolveTenantInvoiceStatusLabel,
  resolveTenantInvoiceStatusTone,
  resolveTenantPaymentStatusLabel,
} from '../../lib/rental-tenant-billing-i18n';
import { hasPaymentProblem, summarizeFailedAttemptReason } from './tenant-invoices.utils';
import {
  useBillingInvoiceDetail,
  useInvoiceDocumentAction,
} from './useBillingInvoiceDetail';
import { Icon } from '../ui/Icon';

interface TenantInvoiceDetailDrawerProps {
  orgId: string | undefined;
  invoice: TenantInvoiceListItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  onManagePaymentMethod?: () => void;
}

export function TenantInvoiceDetailDrawer({
  orgId,
  invoice,
  open,
  onOpenChange,
  canWrite,
  onManagePaymentMethod,
}: TenantInvoiceDetailDrawerProps) {
  const { t, locale } = useLanguage();
  const {
    detail,
    payments,
    detailLoading,
    paymentsLoading,
    detailError,
    paymentsError,
    reloadDetail,
    reloadPayments,
    openHostedInvoice,
    openInvoicePdf,
  } = useBillingInvoiceDetail(orgId, invoice?.id ?? null, open);

  const documents = useInvoiceDocumentAction();

  if (!invoice) return null;

  const display = detail ?? invoice;
  const machineStatus = resolveTenantInvoiceMachineStatus(display);
  const statusLabel = resolveTenantInvoiceStatusLabel(display, t);
  const showProblem = hasPaymentProblem(payments);
  const documentErrorMessage =
    documents.error === 'unavailable'
      ? t('tenantBilling.invoices.document.unavailable')
      : documents.error === 'openFailed'
        ? t('invoices.list.error.openFailed')
        : null;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('tenantBilling.invoices.detail.title', {
        number: display.invoiceNumberLabel,
      })}
      description={t('tenantBilling.invoices.detail.description')}
      status={
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${resolveTenantInvoiceStatusTone(machineStatus)}`}
        >
          {statusLabel}
        </span>
      }
      widthClassName="sm:max-w-2xl"
      footer={
        <div className="flex flex-wrap gap-2">
          {display.hasHostedInvoice ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={documents.loadingHosted}
              onClick={() => void documents.openHosted(() => openHostedInvoice())}
            >
              <Icon name="external-link" className="w-3.5 h-3.5" />
              {documents.loadingHosted
                ? t('tenantBilling.invoices.detail.actions.opening')
                : t('tenantBilling.invoices.detail.actions.hostedInvoice')}
            </Button>
          ) : null}
          {display.hasPdf ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={documents.loadingPdf}
              onClick={() => void documents.openPdf(() => openInvoicePdf())}
            >
              <Icon name="download" className="w-3.5 h-3.5" />
              {documents.loadingPdf
                ? t('tenantBilling.invoices.detail.actions.opening')
                : 'PDF'}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {documentErrorMessage ? (
          <p className="text-xs sq-tone-warning px-2 py-1 rounded">{documentErrorMessage}</p>
        ) : null}

        {detailLoading && !detail ? (
          <div className="h-24 rounded-xl bg-muted/20" />
        ) : detailError ? (
          <ErrorState
            compact
            title={t('tenantBilling.invoices.detail.loadErrorTitle')}
            description={detailError}
            onRetry={() => void reloadDetail()}
            retryLabel={t('common.retry')}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <p className="text-muted-foreground">{t('invoices.list.col.date')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {formatRentalTenantBillingDate(locale, display.invoiceDate)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('bookings.period')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {formatRentalTenantBillingDate(locale, display.periodStart)} –{' '}
                {formatRentalTenantBillingDate(locale, display.periodEnd)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('invoiceLineItem.summary.net')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">{display.netAmount.formatted}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('invoiceLineItem.summary.tax')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {display.taxAmount?.formatted ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('invoiceLineItem.summary.gross')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">{display.grossAmount.formatted}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('invoiceLineItem.summary.outstanding')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {display.amountRemaining?.formatted ?? display.amountDue?.formatted ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('invoices.list.col.dueDate')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {formatRentalTenantBillingDate(locale, display.dueDate)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('bookingPayment.field.paidAt')}</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {formatRentalTenantBillingDate(locale, display.paidAt)}
              </p>
            </div>
          </div>
        )}

        {detail?.lines?.length ? (
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              {t('invoiceLineItem.section.title')}
            </p>
            <div className="space-y-2">
              {detail.lines.map((line, index) => (
                <div key={`${line.description}-${index}`} className="rounded-xl border border-border/60 p-3">
                  <p className="text-[12px] font-semibold">{line.description}</p>
                  <p className="text-[11px] mt-1 text-muted-foreground">
                    {t('tenantBilling.invoices.detail.lineQty', {
                      qty: line.quantity,
                      unit: line.unitAmount?.formatted ?? '—',
                      total: line.grossAmount.formatted,
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showProblem ? (
          <div className="rounded-xl border border-border/60 px-3.5 py-3 sq-tone-critical text-xs space-y-2">
            <p className="font-semibold">{t('tenantBilling.invoices.detail.paymentFailed.title')}</p>
            <p className="text-muted-foreground">
              {payments?.failedAttempts[0]
                ? summarizeFailedAttemptReason(payments.failedAttempts[0]) ??
                  t('tenantBilling.invoices.detail.failedAttempt.fallback')
                : t('tenantBilling.invoices.detail.failedAttempt.fallback')}
            </p>
            {payments?.amountRemaining ? (
              <p>
                {t('invoiceLineItem.summary.outstanding')}:{' '}
                <strong>{payments.amountRemaining.formatted}</strong>
              </p>
            ) : null}
            {canWrite && onManagePaymentMethod ? (
              <Button type="button" size="sm" variant="outline" onClick={onManagePaymentMethod}>
                {t('tenantBilling.invoices.detail.managePaymentMethod')}
              </Button>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              {t('tenantBilling.invoices.detail.payments.title')}
            </p>
            {paymentsLoading ? (
              <span className="text-[10px] text-muted-foreground">{t('common.loading')}</span>
            ) : null}
          </div>
          {paymentsError ? (
            <ErrorState
              compact
              title={t('tenantBilling.invoices.detail.payments.loadErrorTitle')}
              description={paymentsError}
              onRetry={() => void reloadPayments()}
              retryLabel={t('common.retry')}
            />
          ) : payments && payments.payments.length > 0 ? (
            <div className="space-y-2">
              {payments.payments.map((payment, index) => (
                <div
                  key={`${payment.succeededAt ?? payment.failedAt ?? index}`}
                  className="rounded-xl border border-border/60 px-3 py-2.5 text-xs"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold">{payment.amount.formatted}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {payment.providerLabel} ·{' '}
                        {resolveTenantPaymentStatusLabel(
                          payment.status,
                          payment.statusLabel,
                          t,
                        )}
                      </p>
                    </div>
                    <p className="text-muted-foreground tabular-nums">
                      {formatRentalTenantBillingDate(
                        locale,
                        payment.succeededAt ?? payment.failedAt,
                      )}
                    </p>
                  </div>
                  {payment.refundedAmount ? (
                    <p className="mt-1 text-muted-foreground">
                      {t('tenantBilling.invoices.detail.payments.refunded', {
                        amount: payment.refundedAmount.formatted,
                      })}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : !paymentsLoading ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/70 p-3">
              {t('tenantBilling.invoices.detail.payments.empty')}
            </p>
          ) : null}
        </div>
      </div>
    </DetailDrawer>
  );
}
