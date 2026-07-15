import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import { Button } from '../../../components/ui/button';
import { ErrorState } from '../../../components/patterns/states';
import type { TenantInvoiceListItemDto } from '../../types/billing.types';
import { formatDateDe } from './billing.utils';
import {
  hasPaymentProblem,
  resolvePaymentStatusLabel,
  resolveTenantInvoiceStatusLabel,
  summarizeFailedAttempt,
  tenantInvoiceStatusTone,
} from './tenant-invoices.utils';
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
  const statusLabel = resolveTenantInvoiceStatusLabel(display);
  const showProblem = hasPaymentProblem(payments);

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechnung ${display.invoiceNumberLabel}`}
      description="Rechnungsdetails und Zahlungsverlauf"
      status={
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${tenantInvoiceStatusTone(statusLabel)}`}
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
              {documents.loadingHosted ? 'Wird geöffnet…' : 'Online-Rechnung'}
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
              {documents.loadingPdf ? 'Wird geöffnet…' : 'PDF'}
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {documents.error ? (
          <p className="text-xs sq-tone-warning px-2 py-1 rounded">{documents.error}</p>
        ) : null}

        {detailLoading && !detail ? (
          <div className="h-24 rounded-xl bg-muted/20" />
        ) : detailError ? (
          <ErrorState
            compact
            title="Rechnungsdetails konnten nicht geladen werden"
            description={detailError}
            onRetry={() => void reloadDetail()}
            retryLabel="Erneut versuchen"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
            <div>
              <p className="text-muted-foreground">Rechnungsdatum</p>
              <p className="font-semibold mt-0.5 tabular-nums">{formatDateDe(display.invoiceDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Leistungszeitraum</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {formatDateDe(display.periodStart)} – {formatDateDe(display.periodEnd)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Netto</p>
              <p className="font-semibold mt-0.5 tabular-nums">{display.netAmount.formatted}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Steuer</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {display.taxAmount?.formatted ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Brutto</p>
              <p className="font-semibold mt-0.5 tabular-nums">{display.grossAmount.formatted}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Offen</p>
              <p className="font-semibold mt-0.5 tabular-nums">
                {display.amountRemaining?.formatted ?? display.amountDue?.formatted ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fälligkeit</p>
              <p className="font-semibold mt-0.5 tabular-nums">{formatDateDe(display.dueDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Bezahlt am</p>
              <p className="font-semibold mt-0.5 tabular-nums">{formatDateDe(display.paidAt)}</p>
            </div>
          </div>
        )}

        {detail?.lines?.length ? (
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
              Positionen
            </p>
            <div className="space-y-2">
              {detail.lines.map((line, index) => (
                <div key={`${line.description}-${index}`} className="rounded-xl border border-border/60 p-3">
                  <p className="text-[12px] font-semibold">{line.description}</p>
                  <p className="text-[11px] mt-1 text-muted-foreground">
                    {line.quantity} × {line.unitAmount?.formatted ?? '—'} = {line.grossAmount.formatted}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showProblem ? (
          <div className="rounded-xl border border-border/60 px-3.5 py-3 sq-tone-critical text-xs space-y-2">
            <p className="font-semibold">Zahlung fehlgeschlagen</p>
            <p className="text-muted-foreground">
              {payments?.failedAttempts[0]
                ? summarizeFailedAttempt(payments.failedAttempts[0])
                : 'Für diese Rechnung liegt eine fehlgeschlagene Zahlung vor.'}
            </p>
            {payments?.amountRemaining ? (
              <p>
                Offener Betrag: <strong>{payments.amountRemaining.formatted}</strong>
              </p>
            ) : null}
            {canWrite && onManagePaymentMethod ? (
              <Button type="button" size="sm" variant="outline" onClick={onManagePaymentMethod}>
                Zahlungsmethode aktualisieren
              </Button>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Zahlungsverlauf
            </p>
            {paymentsLoading ? (
              <span className="text-[10px] text-muted-foreground">Lade…</span>
            ) : null}
          </div>
          {paymentsError ? (
            <ErrorState
              compact
              title="Zahlungsverlauf konnte nicht geladen werden"
              description={paymentsError}
              onRetry={() => void reloadPayments()}
              retryLabel="Erneut versuchen"
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
                        {resolvePaymentStatusLabel(payment.status, payment.statusLabel)}
                      </p>
                    </div>
                    <p className="text-muted-foreground tabular-nums">
                      {formatDateDe(payment.succeededAt ?? payment.failedAt)}
                    </p>
                  </div>
                  {payment.refundedAmount ? (
                    <p className="mt-1 text-muted-foreground">
                      Erstattet: {payment.refundedAmount.formatted}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : !paymentsLoading ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/70 p-3">
              Für diese Rechnung liegt noch kein Zahlungsverlauf vor.
            </p>
          ) : null}
        </div>
      </div>
    </DetailDrawer>
  );
}
