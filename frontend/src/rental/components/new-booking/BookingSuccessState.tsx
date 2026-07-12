import { useCallback, useEffect, useState } from 'react';
import type { VehicleData } from '../../data/vehicles';
import { api, type BookingDocumentBundleView } from '../../../lib/api';
import { buildMMY } from '../../lib/vehicleMmy';
import { Icon } from '../ui/Icon';
import { BookingStepCard } from './BookingStepCard';
import { CheckoutDocumentsPanel } from './CheckoutDocumentsPanel';
import { formatBookingAmount } from './format';
import type { BookingCustomer } from './types';

export interface BookingSuccessAutoSendResult {
  sent: boolean;
  reason?: string;
  error?: string;
}

export interface BookingSuccessStateProps {
  orgId: string;
  bookingId: string | null;
  selectedCustomer: BookingCustomer | null;
  selectedVehicle: VehicleData | null;
  rentalDays: number;
  grandTotal: number | null;
  pricingCurrency: string | null;
  bookingRef?: string | null;
  redirectCountdown: number | null;
  initialBundle?: BookingDocumentBundleView | null;
  autoSend?: BookingSuccessAutoSendResult | null;
  onBack: () => void;
  onNewBooking: () => void;
}

export function BookingSuccessState({
  orgId,
  bookingId,
  selectedCustomer,
  selectedVehicle,
  rentalDays,
  grandTotal,
  pricingCurrency,
  bookingRef,
  redirectCountdown,
  initialBundle = null,
  autoSend = null,
  onBack,
  onNewBooking,
}: BookingSuccessStateProps) {
  const refLabel = bookingRef ? `Buchung #${bookingRef}` : 'Buchung wurde erfolgreich angelegt';
  const [bundle, setBundle] = useState<BookingDocumentBundleView | null>(initialBundle);
  const [bundleLoading, setBundleLoading] = useState(false);

  const refreshBundle = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setBundleLoading(true);
    try {
      const view = await api.documents.listForBooking(orgId, bookingId);
      setBundle(view);
    } finally {
      setBundleLoading(false);
    }
  }, [orgId, bookingId]);

  useEffect(() => {
    if (!orgId || !bookingId) return;
    if (autoSend?.sent) {
      const timer = setTimeout(() => void refreshBundle(), 1500);
      return () => clearTimeout(timer);
    }
    if (!initialBundle) void refreshBundle();
  }, [orgId, bookingId, autoSend?.sent, initialBundle, refreshBundle]);

  return (
    <div className="flex items-center justify-center py-8">
      <BookingStepCard>
        <div className="max-w-lg p-8 text-center sm:p-10">
          <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full sq-tone-success">
            <Icon name="check-circle" className="h-5 w-5 text-[color:var(--status-positive)]" />
          </div>
          <h2 className="mb-2 text-lg text-foreground">Buchung erstellt!</h2>
          <p className="mb-2 text-xs text-muted-foreground">{refLabel}</p>
          {autoSend?.sent && (
            <p className="mb-2 text-xs text-[color:var(--status-positive)]">
              Dokumente wurden automatisch an {selectedCustomer?.email} gesendet.
            </p>
          )}
          {autoSend && !autoSend.sent && autoSend.reason === 'DISABLED' ? null : autoSend &&
            !autoSend.sent &&
            autoSend.reason === 'NO_CUSTOMER_EMAIL' && (
              <p className="mb-2 text-xs text-[color:var(--status-watch)]">
                Automatischer Versand nicht möglich — Kunden-E-Mail fehlt.
              </p>
            )}
          {redirectCountdown !== null && redirectCountdown > 0 && (
            <p className="mb-3 text-xs text-muted-foreground">
              Weiterleitung zur Übersicht in {redirectCountdown}s…
            </p>
          )}
          <div className="mb-4 space-y-2 rounded-lg bg-muted/50 p-4 text-left">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Kunde</span>
              <span className="text-foreground">{selectedCustomer?.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Fahrzeug</span>
              <span className="text-foreground">{selectedVehicle ? buildMMY(selectedVehicle) : '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Zeitraum</span>
              <span className="text-foreground">{rentalDays} Tage</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-xs">
              <span className="text-muted-foreground">Gesamtbetrag</span>
              <span className="text-[color:var(--status-positive)]">
                {pricingCurrency ? formatBookingAmount(grandTotal, pricingCurrency) : '—'}
              </span>
            </div>
          </div>

          {bookingId && (
            <div className="mb-4 text-left">
              <h3 className="mb-2 text-sm text-muted-foreground">Dokumente</h3>
              <CheckoutDocumentsPanel
                orgId={orgId}
                bookingId={bookingId}
                customerEmail={selectedCustomer?.email}
                bundle={bundle}
                loading={bundleLoading && !bundle}
                onRefresh={() => void refreshBundle()}
                showBulkSend
              />
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex-1 rounded-lg border border-border surface-premium px-3 py-2 text-xs text-foreground transition-all hover:bg-muted"
            >
              Zur Übersicht
            </button>
            <button
              type="button"
              onClick={onNewBooking}
              className="sq-3d-btn sq-3d-btn--primary flex-1 px-3 py-2 text-xs"
            >
              Neue Buchung
            </button>
          </div>
        </div>
      </BookingStepCard>
    </div>
  );
}
