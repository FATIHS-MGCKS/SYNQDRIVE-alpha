import type { BookingDetailDto } from '../../../lib/api';
import { BookingDocumentsSection } from '../BookingDocumentsSection';
import { BookingPaymentCard } from '../booking-payment/BookingPaymentCard';
import { EM_DASH, formatCurrencyCents, parseBookingExtras, paymentStatusLabel, depositStatusLabel } from './bookingDetailUtils';

import { bd } from './booking-detail-ui';

interface BookingFinanceDocumentsTabProps {
  orgId: string;
  detail: BookingDetailDto;
  isDarkMode: boolean;
  onRefresh: () => void;
  onRecordManualPayment?: (invoiceId: string) => void;
}

export function BookingFinanceDocumentsTab({
  orgId,
  detail,
  isDarkMode,
  onRefresh,
  onRecordManualPayment,
}: BookingFinanceDocumentsTabProps) {
  const f = detail.finance;
  const extras = parseBookingExtras(detail.core.extras);
  const currency = detail.core.currency || 'EUR';

  return (
    <div className="space-y-6">
      <BookingPaymentCard
        orgId={orgId}
        bookingId={detail.core.bookingId}
        detail={detail}
        onRefresh={onRefresh}
        onRecordManualPayment={onRecordManualPayment}
      />

      <div className={bd.card}>
        <h3 className="text-xs font-bold mb-4">Rechnungsübersicht</h3>
        {!f.computed ? (
          <p className="text-sm text-muted-foreground">Noch nicht berechnet — keine verlässlichen Beträge vorhanden.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2 text-xs">
            <FinRow label="Mietpreis" value={formatCurrencyCents(f.basePriceCents, currency)} />
            <FinRow label="Extras" value={formatCurrencyCents(f.extrasPriceCents, currency)} />
            <FinRow label="Rabatt" value={formatCurrencyCents(f.discountAmountCents, currency)} />
            <FinRow label="Kaution" value={formatCurrencyCents(f.depositAmountCents, currency)} />
            <FinRow label="Kaution Status" value={depositStatusLabel(f.depositStatus)} />
            <FinRow label="Steuer" value={f.taxAmountCents != null ? formatCurrencyCents(f.taxAmountCents, currency) : EM_DASH} />
            <FinRow label="Brutto" value={formatCurrencyCents(f.grossAmountCents, currency)} />
            <FinRow label="Bezahlt" value={formatCurrencyCents(f.paidAmountCents, currency)} />
            <FinRow label="Offen" value={formatCurrencyCents(f.openAmountCents, currency)} />
            <FinRow label="Zahlungsstatus (Rechnung)" value={paymentStatusLabel(f.paymentStatus)} />
            <FinRow label="Rechnungsstatus" value={f.invoiceStatus ?? EM_DASH} />
            <FinRow label="Schlussrechnung" value={f.finalInvoiceStatus ?? EM_DASH} />
            <FinRow label="Zusatzkosten" value={formatCurrencyCents(f.additionalChargesCents, currency)} />
            <FinRow label="Einbehaltene Kaution" value={formatCurrencyCents(f.retainedDepositAmountCents, currency)} />
            <FinRow label="Erstattung" value={formatCurrencyCents(f.refundAmountCents, currency)} />
          </dl>
        )}
      </div>

      <div className={bd.card}>
        <h3 className="text-xs font-bold mb-3">Extras</h3>
        {extras.length === 0 ? (
          <p className="text-xs text-muted-foreground">Keine strukturierten Extras hinterlegt.</p>
        ) : (
          <div className="space-y-2 sm:hidden">
            {extras.map((ex, i) => (
              <div key={`${ex.name}-${i}`} className="rounded-lg border border-border p-3 text-xs">
                <p className="font-medium text-foreground">{ex.name}</p>
                <p className="text-muted-foreground">Menge: {ex.quantity}</p>
                <p className="text-muted-foreground">Einzel: {formatCurrencyCents(ex.unitPriceCents, currency)}</p>
                <p className="text-foreground">Gesamt: {formatCurrencyCents(ex.totalPriceCents, currency)}</p>
              </div>
            ))}
          </div>
        )}
        {extras.length > 0 && (
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-2">Name</th>
                  <th className="py-2 pr-2">Menge</th>
                  <th className="py-2 pr-2">Einzelpreis</th>
                  <th className="py-2 pr-2">Gesamt</th>
                  <th className="py-2">Steuer</th>
                </tr>
              </thead>
              <tbody>
                {extras.map((ex, i) => (
                  <tr key={`${ex.name}-${i}`} className="border-b border-border/50">
                    <td className="py-2 pr-2">{ex.name}</td>
                    <td className="py-2 pr-2">{ex.quantity}</td>
                    <td className="py-2 pr-2">{formatCurrencyCents(ex.unitPriceCents, currency)}</td>
                    <td className="py-2 pr-2">{formatCurrencyCents(ex.totalPriceCents, currency)}</td>
                    <td className="py-2">{ex.taxable == null ? EM_DASH : ex.taxable ? 'Ja' : 'Nein'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BookingDocumentsSection
        orgId={orgId}
        bookingId={detail.core.bookingId}
        isDarkMode={isDarkMode}
        customerEmail={detail.customer.email}
        bookingNumber={detail.core.bookingNumber}
      />
    </div>
  );
}

function FinRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground text-right">{value}</dd>
    </div>
  );
}
