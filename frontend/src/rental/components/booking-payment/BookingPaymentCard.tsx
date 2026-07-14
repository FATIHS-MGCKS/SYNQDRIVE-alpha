import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, type BookingDetailDto } from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import type { TranslationKey } from '../../i18n/translations/en';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { paymentIntentLabel } from '../new-booking/payment-intent';
import type { BookingPaymentIntent } from '../new-booking/types';
import { Icon } from '../ui/Icon';
import { bd } from '../booking-detail/booking-detail-ui';
import {
  canCancelPaymentRequest,
  canCopyPaymentLink,
  canRefundPaymentRequest,
  canResendPaymentLink,
  copyTextToClipboard,
  paymentRequestStatusLabel,
  paymentRequestStatusTone,
  type BookingPaymentCardRequestDto,
} from './booking-payment-status.utils';

interface BookingPaymentCardProps {
  orgId: string;
  bookingId: string;
  detail: BookingDetailDto;
  onRefresh: () => void;
  onRecordManualPayment?: (invoiceId: string) => void;
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: ReturnType<typeof paymentRequestStatusTone>;
}) {
  const toneBg =
    tone === 'positive'
      ? 'bg-[color:var(--status-positive)]/15 text-[color:var(--status-positive)]'
      : tone === 'watch'
        ? 'bg-[color:var(--status-watch)]/15 text-[color:var(--status-watch)]'
        : tone === 'negative'
          ? 'bg-[color:var(--status-negative)]/15 text-[color:var(--status-negative)]'
          : 'bg-muted text-muted-foreground';

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${toneBg}`}>
      {label}
    </span>
  );
}

function InfoRow({ label, value, id }: { label: string; value: string; id?: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd id={id} className="text-xs font-medium text-foreground sm:text-right">
        {value}
      </dd>
    </div>
  );
}

export function BookingPaymentCard({
  orgId,
  bookingId,
  detail,
  onRefresh,
  onRecordManualPayment,
}: BookingPaymentCardProps) {
  const { t, locale } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const payments = detail.payments;
  const [busy, setBusy] = useState<string | null>(null);

  const canRead = hasPermission('payments', 'read');
  const canCreate = hasPermission('payments', 'write');
  const canResend = hasPermission('payments', 'write');
  const canCancel = hasPermission('payments', 'write');
  const canRefund = hasPermission('payments-refund', 'write');
  const canManualPay = hasPermission('invoices', 'write');

  const request = payments?.primaryRequest ?? null;
  const currency = request?.currency ?? detail.core.currency ?? 'EUR';
  const fmt = (cents: number | null | undefined) =>
    formatMoneyCents(cents, currency, locale === 'de' ? 'de-DE' : 'en-US');

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmountInput, setRefundAmountInput] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundConfirmed, setRefundConfirmed] = useState(false);

  const refundableCents = request?.refundableAmountCents
    ?? Math.max(0, (request?.paidAmountCents ?? 0) - (request?.refundedAmountCents ?? 0));

  const parsedRefundCents = useMemo(() => {
    if (!refundAmountInput.trim()) return undefined;
    const normalized = refundAmountInput.replace(',', '.').trim();
    const euros = Number.parseFloat(normalized);
    if (!Number.isFinite(euros) || euros <= 0) return null;
    return Math.round(euros * 100);
  }, [refundAmountInput]);

  const intent = payments?.summary.paymentIntent as BookingPaymentIntent | null;
  const bookingPaymentStatus = payments?.summary.bookingPaymentStatus ?? 'UNPAID';

  const handleCopy = useCallback(async (url: string) => {
    const ok = await copyTextToClipboard(url);
    toast[ok ? 'success' : 'error'](
      ok ? t('bookingPayment.action.linkCopied') : t('bookingPayment.action.linkCopyFailed'),
    );
  }, [t]);

  const handleResend = useCallback(async (requestId: string) => {
    setBusy('resend');
    try {
      await api.bookingPaymentRequests.resend(orgId, bookingId, requestId);
      toast.success(t('bookingPayment.action.resendQueued'));
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('bookingPayment.action.resendFailed'));
    } finally {
      setBusy(null);
    }
  }, [orgId, bookingId, onRefresh, t]);

  const handleCancel = useCallback(async (requestId: string) => {
    setBusy('cancel');
    try {
      await api.bookingPaymentRequests.cancel(orgId, bookingId, requestId);
      toast.success(t('bookingPayment.action.cancelled'));
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('bookingPayment.action.cancelFailed'));
    } finally {
      setBusy(null);
    }
  }, [orgId, bookingId, onRefresh, t]);

  const resetRefundForm = useCallback(() => {
    setRefundAmountInput('');
    setRefundReason('');
    setRefundConfirmed(false);
    setRefundOpen(false);
  }, []);

  const handleRefund = useCallback(async () => {
    if (!request || !refundConfirmed || !refundReason.trim()) return;
    if (parsedRefundCents === null) {
      toast.error(t('bookingPayment.action.refundFailed'));
      return;
    }
    if (parsedRefundCents != null && parsedRefundCents > refundableCents) {
      toast.error(t('bookingPayment.action.refundFailed'));
      return;
    }

    setBusy('refund');
    try {
      const idempotencyKey = `refund:${request.id}:${Date.now()}`;
      const result = await api.organizationPaymentRequests.refund(
        orgId,
        request.id,
        {
          reason: refundReason.trim(),
          ...(parsedRefundCents != null ? { amountCents: parsedRefundCents } : {}),
        },
        idempotencyKey,
      );
      toast.success(
        result.idempotentReplay
          ? t('bookingPayment.action.refundSuccess')
          : `${t('bookingPayment.action.refundSuccess')} · ${fmt(result.refundAmountCents)}`,
      );
      resetRefundForm();
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('bookingPayment.action.refundFailed'));
    } finally {
      setBusy(null);
    }
  }, [
    fmt,
    onRefresh,
    orgId,
    parsedRefundCents,
    refundConfirmed,
    refundReason,
    refundableCents,
    request,
    resetRefundForm,
    t,
  ]);

  const handleCreateLink = useCallback(async () => {
    setBusy('create');
    try {
      const idempotencyKey = `booking-detail:${bookingId}:${Date.now()}`;
      await api.bookingPaymentRequests.create(orgId, bookingId, { sendEmail: true }, idempotencyKey);
      toast.success(t('bookingPayment.action.createQueued'));
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('bookingPayment.action.createFailed'));
    } finally {
      setBusy(null);
    }
  }, [orgId, bookingId, onRefresh, t]);

  if (!payments?.enabled) {
    return null;
  }

  const refundLabel = (r: BookingPaymentCardRequestDto) => {
    const map: Record<string, TranslationKey> = {
      NONE: 'bookingPayment.refund.none',
      PARTIAL: 'bookingPayment.refund.partial',
      FULL: 'bookingPayment.refund.full',
    };
    return t(map[r.refundStatus]);
  };

  const disputeLabel = (r: BookingPaymentCardRequestDto) =>
    r.disputeStatus === 'OPEN' ? t('bookingPayment.dispute.open') : t('bookingPayment.dispute.none');

  const showStickyActions =
    request
    && (canCopyPaymentLink(request) || (canResend && canResendPaymentLink(request.status)));

  return (
    <div className={bd.card} role="region" aria-labelledby="booking-payment-card-title">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <h3 id="booking-payment-card-title" className="text-xs font-bold">
          {t('bookingPayment.card.title')}
        </h3>
        <StatusBadge
          label={paymentRequestStatusLabel(request?.status ?? bookingPaymentStatus, t)}
          tone={paymentRequestStatusTone(request?.status ?? bookingPaymentStatus)}
        />
      </div>

      <dl className="space-y-3">
        {intent && (
          <InfoRow
            label={t('bookingPayment.field.intent')}
            value={paymentIntentLabel(intent, t)}
          />
        )}
        <InfoRow
          label={t('bookingPayment.field.bookingPaymentStatus')}
          value={paymentRequestStatusLabel(bookingPaymentStatus, t)}
        />
        {request && (
          <>
            <InfoRow label={t('bookingPayment.field.requestedAmount')} value={fmt(request.amountCents)} />
            <InfoRow label={t('bookingPayment.field.paidAmount')} value={fmt(request.paidAmountCents)} />
            <InfoRow label={t('bookingPayment.field.openAmount')} value={fmt(request.openAmountCents)} />
            <InfoRow label={t('bookingPayment.field.currency')} value={request.currency} />
            {request.depositAmountCents > 0 && (
              <InfoRow
                label={t('bookingPayment.field.depositSeparate')}
                value={fmt(request.depositAmountCents)}
              />
            )}
            <InfoRow
              label={t('bookingPayment.field.linkStatus')}
              value={paymentRequestStatusLabel(request.status, t)}
            />
            {request.checkoutExpiresAt && (
              <InfoRow
                label={t('bookingPayment.field.linkExpiry')}
                value={new Date(request.checkoutExpiresAt).toLocaleString(
                  locale === 'de' ? 'de-DE' : 'en-US',
                )}
              />
            )}
            {request.lastSentAt && (
              <InfoRow
                label={t('bookingPayment.field.sentAt')}
                value={new Date(request.lastSentAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')}
              />
            )}
            {request.paidAt && (
              <InfoRow
                label={t('bookingPayment.field.paidAt')}
                value={new Date(request.paidAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US')}
              />
            )}
            {request.paymentMethodLabel && (
              <InfoRow label={t('bookingPayment.field.paymentMethod')} value={request.paymentMethodLabel} />
            )}
            {request.lastEmailErrorMessage && (
              <div className="rounded-md bg-[color:var(--status-watch)]/10 p-2 text-xs text-[color:var(--status-watch)]" role="alert">
                {t('bookingPayment.field.emailError')}: {request.lastEmailErrorMessage}
              </div>
            )}
            <InfoRow label={t('bookingPayment.field.refundStatus')} value={refundLabel(request)} />
            {refundableCents > 0 && (
              <InfoRow
                label={t('bookingPayment.field.refundableAmount')}
                value={fmt(refundableCents)}
              />
            )}
            <InfoRow label={t('bookingPayment.field.disputeStatus')} value={disputeLabel(request)} />
            {request.stripeCheckoutSessionId && (
              <InfoRow
                label={t('bookingPayment.field.stripeSession')}
                value={request.stripeCheckoutSessionId}
              />
            )}
            {request.stripePaymentIntentId && (
              <InfoRow
                label={t('bookingPayment.field.stripePaymentIntent')}
                value={request.stripePaymentIntentId}
              />
            )}
          </>
        )}
        {payments.invoice && (
          <InfoRow
            label={t('bookingPayment.field.invoice')}
            value={`${payments.invoice.invoiceNumber ?? payments.invoice.id.slice(-8)} · ${payments.invoice.status}`}
          />
        )}
      </dl>

      {canRead && (
        <div
          className={`mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap ${
            showStickyActions ? 'sticky bottom-0 z-10 -mx-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0' : ''
          }`}
          style={showStickyActions ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' } : undefined}
        >
          {!request && canCreate && intent === 'payment_link' && (
            <button
              type="button"
              disabled={busy === 'create'}
              onClick={() => void handleCreateLink()}
              className="sq-3d-btn sq-3d-btn--primary inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-xs"
            >
              <Icon name="link" className="h-3.5 w-3.5" aria-hidden />
              {t('bookingPayment.action.createLink')}
            </button>
          )}
          {request?.checkoutUrl && canCopyPaymentLink(request) && (
            <>
              <a
                href={request.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sq-3d-btn sq-3d-btn--primary inline-flex min-h-11 items-center justify-center gap-1.5 px-3 py-2 text-xs"
              >
                {t('bookingPayment.action.openLink')}
              </a>
              <button
                type="button"
                onClick={() => void handleCopy(request.checkoutUrl!)}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
              >
                {t('bookingPayment.action.copyLink')}
              </button>
            </>
          )}
          {request && canResend && canResendPaymentLink(request.status) && (
            <button
              type="button"
              disabled={busy === 'resend'}
              onClick={() => void handleResend(request.id)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
            >
              {busy === 'resend' ? t('bookingPayment.action.resending') : t('bookingPayment.action.resendLink')}
            </button>
          )}
          {request && canCancel && canCancelPaymentRequest(request.status) && (
            <button
              type="button"
              disabled={busy === 'cancel'}
              onClick={() => void handleCancel(request.id)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[color:var(--status-negative)]/40 px-3 py-2 text-xs text-[color:var(--status-negative)] hover:bg-[color:var(--status-negative)]/10 disabled:opacity-50"
            >
              {t('bookingPayment.action.cancelRequest')}
            </button>
          )}
          {request && canRefund && canRefundPaymentRequest({
            status: request.status,
            refundableAmountCents: refundableCents,
            disputeStatus: request.disputeStatus,
          }) && (
            <button
              type="button"
              disabled={busy === 'refund'}
              onClick={() => setRefundOpen(true)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted disabled:opacity-50"
            >
              {t('bookingPayment.action.refund')}
            </button>
          )}
          {payments.invoice && canManualPay && onRecordManualPayment && (
            <button
              type="button"
              onClick={() => onRecordManualPayment(payments.invoice!.id)}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted"
            >
              {t('bookingPayment.action.recordManualPayment')}
            </button>
          )}
        </div>
      )}

      {refundOpen && request && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-refund-dialog-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-lg">
            <h4 id="booking-refund-dialog-title" className="mb-3 text-sm font-bold">
              {t('bookingPayment.refund.modalTitle')}
            </h4>
            <p className="mb-3 text-xs text-muted-foreground">
              {t('bookingPayment.refund.maxAmount')}: {fmt(refundableCents)}
            </p>
            <label className="mb-3 block text-xs">
              <span className="mb-1 block text-muted-foreground">{t('bookingPayment.refund.amount')}</span>
              <input
                type="text"
                inputMode="decimal"
                value={refundAmountInput}
                onChange={(e) => setRefundAmountInput(e.target.value)}
                placeholder={fmt(refundableCents)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <span className="mt-1 block text-[11px] text-muted-foreground">
                {t('bookingPayment.refund.amountHint')}
              </span>
            </label>
            <label className="mb-3 block text-xs">
              <span className="mb-1 block text-muted-foreground">{t('bookingPayment.refund.reason')}</span>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="mb-4 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={refundConfirmed}
                onChange={(e) => setRefundConfirmed(e.target.checked)}
                className="mt-0.5"
              />
              <span>{t('bookingPayment.refund.confirm')}</span>
            </label>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy === 'refund'}
                onClick={resetRefundForm}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-3 py-2 text-xs"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={
                  busy === 'refund'
                  || !refundConfirmed
                  || !refundReason.trim()
                  || parsedRefundCents === null
                }
                onClick={() => void handleRefund()}
                className="sq-3d-btn sq-3d-btn--primary inline-flex min-h-11 items-center justify-center px-3 py-2 text-xs disabled:opacity-50"
              >
                {busy === 'refund' ? t('bookingPayment.action.refunding') : t('bookingPayment.action.refundSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
