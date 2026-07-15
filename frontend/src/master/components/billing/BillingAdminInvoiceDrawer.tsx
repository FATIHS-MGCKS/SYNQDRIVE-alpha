import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DetailDrawer } from '../../../components/patterns/detail-drawer';
import type {
  AdminBillingInvoiceDto,
  AdminInvoicePaymentHistoryDto,
} from '../../types/admin-billing.types';
import {
  formatDateDe,
  formatMoneyCents,
} from './admin-billing.utils';
import {
  createManualPaymentIdempotencyKey,
  invoiceDisplayStatusLabel,
  invoiceDisplayStatusTone,
  isSafeExternalUrl,
  resolveInvoiceDisplayStatus,
  stripeDashboardInvoiceUrl,
} from './master-invoices.utils';

interface BillingAdminInvoiceDrawerProps {
  invoice: AdminBillingInvoiceDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated?: () => void;
}

export function BillingAdminInvoiceDrawer({
  invoice,
  open,
  onOpenChange,
  onUpdated,
}: BillingAdminInvoiceDrawerProps) {
  const [history, setHistory] = useState<AdminInvoicePaymentHistoryDto | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAmount, setManualAmount] = useState('');
  const [manualType, setManualType] = useState<'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'OTHER'>(
    'BANK_TRANSFER',
  );
  const [manualReference, setManualReference] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !invoice) {
      setHistory(null);
      setHistoryError(null);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    void api.billing
      .adminInvoicePayments(invoice.id)
      .then((payload) => setHistory(payload as AdminInvoicePaymentHistoryDto))
      .catch((error) => setHistoryError((error as Error).message))
      .finally(() => setHistoryLoading(false));
  }, [open, invoice?.id]);

  if (!invoice) return null;

  const currency = (invoice.currency ?? 'EUR').toUpperCase();
  const gross = invoice.grossAmountCents ?? invoice.amountCents;
  const displayStatus = resolveInvoiceDisplayStatus(invoice);
  const lines = invoice.invoiceLines ?? invoice.lines ?? [];
  const stripeUrl = stripeDashboardInvoiceUrl(invoice.stripeInvoiceId, 'TEST');
  const orgId = invoice.subscription?.organizationId;

  const recordManualPayment = async () => {
    if (!orgId) return;
    const amountCents = Math.round(Number(manualAmount.replace(',', '.')) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return;
    setSaving(true);
    setActionMessage(null);
    try {
      await api.billing.adminRecordManualPayment(
        invoice.id,
        {
          orgId,
          amountCents,
          currency,
          paymentType: manualType,
          reference: manualReference || undefined,
        },
        createManualPaymentIdempotencyKey(invoice.id),
      );
      setManualOpen(false);
      setActionMessage('Manuelle Zahlung erfasst.');
      onUpdated?.();
    } catch (error) {
      setActionMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={`Rechnung ${invoice.invoiceNumberDisplay ?? invoice.invoiceNumber ?? invoice.id.slice(0, 8)}`}
      description={invoice.subscription?.organization.companyName}
      status={
        <span
          className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${invoiceDisplayStatusTone(displayStatus)}`}
        >
          {invoiceDisplayStatusLabel(displayStatus)}
        </span>
      }
      footer={
        <div className="flex flex-wrap gap-2">
          {isSafeExternalUrl(invoice.hostedInvoiceUrl) ? (
            <a
              href={invoice.hostedInvoiceUrl!}
              target="_blank"
              rel="noreferrer noopener"
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-border/70"
            >
              Rechnung öffnen
            </a>
          ) : null}
          {isSafeExternalUrl(invoice.invoicePdfUrl) ? (
            <a
              href={invoice.invoicePdfUrl!}
              target="_blank"
              rel="noreferrer noopener"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-white"
            >
              PDF
            </a>
          ) : null}
          {stripeUrl ? (
            <a
              href={stripeUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-border/70"
            >
              Stripe
            </a>
          ) : null}
        </div>
      }
    >
      <div className="space-y-5 text-xs">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
          >
            Manuelle Zahlung
          </button>
        </div>

        {actionMessage ? (
          <p className="rounded-lg px-3 py-2 bg-muted/30">{actionMessage}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-muted-foreground">Netto</p>
            <p className="font-semibold tabular-nums mt-0.5">
              {formatMoneyCents(invoice.netAmountCents, currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Steuer</p>
            <p className="font-semibold tabular-nums mt-0.5">
              {formatMoneyCents(invoice.taxAmountCents, currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Brutto</p>
            <p className="font-semibold tabular-nums mt-0.5">{formatMoneyCents(gross, currency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Offen</p>
            <p className="font-semibold tabular-nums mt-0.5">
              {formatMoneyCents(invoice.amountRemainingCents, currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Fälligkeit</p>
            <p className="font-semibold mt-0.5">{formatDateDe(invoice.dueDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bezahlt am</p>
            <p className="font-semibold mt-0.5">{formatDateDe(invoice.paidAt)}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Zahlungsverlauf
          </p>
          {historyLoading ? <p className="text-muted-foreground">Lade Zahlungsverlauf…</p> : null}
          {historyError ? <p className="sq-tone-warning px-2 py-1 rounded">{historyError}</p> : null}
          {history && history.payments.length === 0 ? (
            <p className="text-muted-foreground border border-dashed border-border/70 rounded-lg p-3">
              Keine Zahlungen erfasst.
            </p>
          ) : null}
          {history?.payments.map((payment, index) => (
            <div key={index} className="rounded-xl border border-border/60 p-3 mb-2">
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{payment.statusLabel}</span>
                <span className="tabular-nums">{formatMoneyCents(payment.amount.cents, currency)}</span>
              </div>
              <p className="text-muted-foreground mt-1">
                {payment.providerLabel}
                {payment.succeededAt ? ` · ${formatDateDe(payment.succeededAt)}` : ''}
                {payment.failedAt ? ` · Fehlgeschlagen ${formatDateDe(payment.failedAt)}` : ''}
              </p>
              {payment.attempts.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {payment.attempts.map((attempt) => (
                    <p key={attempt.attemptNumber} className="text-[11px] text-muted-foreground">
                      Versuch {attempt.attemptNumber}: {attempt.statusLabel}
                      {attempt.safeErrorMessage ? ` — ${attempt.safeErrorMessage}` : ''}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {history && (history.refunds.length > 0 || history.creditNotes.length > 0) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {history.refunds.length > 0 ? (
              <div>
                <p className="font-semibold mb-2">Refunds</p>
                {history.refunds.map((refund, index) => (
                  <p key={index} className="text-muted-foreground">
                    {refund.statusLabel} · {formatMoneyCents(refund.amount.cents, currency)}
                  </p>
                ))}
              </div>
            ) : null}
            {history.creditNotes.length > 0 ? (
              <div>
                <p className="font-semibold mb-2">Gutschriften</p>
                {history.creditNotes.map((note, index) => (
                  <p key={index} className="text-muted-foreground">
                    {note.statusLabel} · {formatMoneyCents(note.amount.cents, currency)}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Positionen
          </p>
          {lines.length === 0 ? (
            <p className="text-muted-foreground border border-dashed border-border/70 rounded-lg p-3">
              Keine Line Items.
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

      {manualOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="surface-premium rounded-2xl p-5 w-full max-w-md shadow-[var(--shadow-2)] space-y-4">
            <h3 className="text-[15px] font-semibold">Manuelle Zahlung erfassen</h3>
            <input
              value={manualAmount}
              onChange={(event) => setManualAmount(event.target.value)}
              placeholder="Betrag in Euro"
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            />
            <select
              value={manualType}
              onChange={(event) =>
                setManualType(event.target.value as 'BANK_TRANSFER' | 'CASH' | 'CHECK' | 'OTHER')
              }
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            >
              <option value="BANK_TRANSFER">Überweisung</option>
              <option value="CASH">Bar</option>
              <option value="CHECK">Scheck</option>
              <option value="OTHER">Sonstiges</option>
            </select>
            <input
              value={manualReference}
              onChange={(event) => setManualReference(event.target.value)}
              placeholder="Referenz (optional)"
              className="w-full px-3 py-2 rounded-xl border border-border/70 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs border border-border/70"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void recordManualPayment()}
                className="px-3 py-1.5 rounded-lg text-xs bg-[var(--brand)] text-white font-semibold"
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DetailDrawer>
  );
}
