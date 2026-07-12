import { CreditCard, Euro, FileText } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import { CheckoutDocumentsPanel } from './CheckoutDocumentsPanel';
import type { CheckoutStepProps } from './types';

export function CheckoutStep({
  selectedCustomer,
  paymentMethod,
  onPaymentMethodChange,
  discountPercent,
  onDiscountPercentChange,
  discountAmount,
  agbAccepted,
  privacyAccepted,
  onAgbAcceptedChange,
  onPrivacyAcceptedChange,
  orgId,
  draftBookingId,
  draftBundle,
  draftBundleLoading,
  draftBundleError,
  onRefreshDraftBundle,
  pricingCurrency,
}: CheckoutStepProps) {
  const ccy = pricingCurrency;
  const fmt = (value: number | null | undefined) =>
    ccy ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: ccy }).format(value ?? 0) : '—';

  return (
    <div className="space-y-4">
      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">Zahlungsmethode</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'card' as const, label: 'Kartenzahlung', icon: CreditCard, desc: 'Kredit-/Debitkarte' },
              { id: 'cash' as const, label: 'Barzahlung', icon: Euro, desc: 'Bei Abholung' },
              { id: 'invoice' as const, label: 'Rechnung', icon: FileText, desc: 'Firmenrechnung' },
            ].map((m) => {
              const isInvoiceDisabled = m.id === 'invoice' && selectedCustomer?.type !== 'Corporate';
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    if (!isInvoiceDisabled) onPaymentMethodChange(m.id);
                  }}
                  disabled={isInvoiceDisabled}
                  className={`rounded-lg border p-3.5 text-center transition-all ${isInvoiceDisabled ? 'cursor-not-allowed border-border bg-muted/20 opacity-40' : paymentMethod === m.id ? 'sq-tone-brand border border-border ring-1 ring-[color:var(--brand-glow)]' : 'border-border bg-muted/40 hover:border-border'}`}
                >
                  <m.icon
                    className={`mx-auto mb-1.5 h-5 w-5 ${isInvoiceDisabled ? 'text-muted-foreground' : paymentMethod === m.id ? 'text-status-info' : 'text-muted-foreground'}`}
                  />
                  <p className="text-xs text-foreground">{m.label}</p>
                  <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                  {isInvoiceDisabled && (
                    <p className="mt-1 text-xs text-[color:var(--status-watch)]">Nur Firmenkunden</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">Rabatt</h2>
          <div className="flex flex-wrap items-center gap-2">
            {[0, 5, 10, 15, 20].map((d) => (
              <button
                key={d}
                onClick={() => onDiscountPercentChange(d)}
                className={`rounded-lg border px-3.5 py-1.5 text-xs transition-all ${discountPercent === d ? 'sq-tone-success border border-border' : 'border-border bg-muted/40 text-muted-foreground hover:border-border'}`}
              >
                {d}%
              </button>
            ))}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs">
              <input
                type="number"
                min={0}
                max={100}
                placeholder="Eigener"
                value={![0, 5, 10, 15, 20].includes(discountPercent) ? discountPercent : ''}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                  onDiscountPercentChange(val);
                }}
                className="w-16 bg-transparent text-center text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          {discountPercent > 0 && (
            <p className="mt-2 text-xs text-[color:var(--status-positive)]">Ersparnis: {fmt(discountAmount)}</p>
          )}
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">Dokumente</h2>
          <CheckoutDocumentsPanel
            orgId={orgId}
            bookingId={draftBookingId}
            customerEmail={selectedCustomer?.email}
            bundle={draftBundle}
            loading={draftBundleLoading}
            error={draftBundleError}
            onRefresh={onRefreshDraftBundle}
          />
        </div>
      </BookingStepCard>

      <BookingStepCard>
        <div className="p-4">
          <h2 className="mb-3 text-lg text-muted-foreground">Bestätigungen</h2>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={agbAccepted}
                onChange={(e) => onAgbAcceptedChange(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-foreground">
                Kunde hat die <span className="text-status-info underline">Allgemeinen Geschäftsbedingungen (AGB)</span>{' '}
                und die Mietbedingungen erhalten.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => onPrivacyAcceptedChange(e.target.checked)}
                className="mt-0.5 rounded"
              />
              <span className="text-xs text-foreground">
                Kunde hat der <span className="text-status-info underline">Datenschutzerklärung</span> zugestimmt und wurde
                über die Verarbeitung seiner Daten informiert.
              </span>
            </label>
          </div>
        </div>
      </BookingStepCard>
    </div>
  );
}
