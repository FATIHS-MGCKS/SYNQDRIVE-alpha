import { Icon } from '../ui/Icon';
import { EmptyState, StatusChip } from '../../../components/patterns';
import type { BookingRow } from './customerDetailTypes';
import {
  bookingStatusLabelDe,
  computeBookingRevenueCents,
  EM_DASH,
  formatCurrencyCents,
  formatDate,
} from './customerDetailUtils';
import { bookingStatusTone } from './customerOverviewTabUtils';

interface CustomerBookingsTabProps {
  bookings: BookingRow[];
  totalRevenueCents: number;
  totalKmDriven: number;
  onOpenBooking?: (bookingId: string) => void;
}

export function CustomerBookingsTab({
  bookings,
  totalRevenueCents,
  totalKmDriven,
  onOpenBooking,
}: CustomerBookingsTabProps) {
  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="calendar" className="w-6 h-6" />}
        title="Noch keine Buchungen für diesen Kunden"
        description="Legen Sie eine neue Buchung an, um die Historie hier zu sehen."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-lg border border-border surface-premium text-xs">
        <span>
          Buchungen: <strong>{bookings.length}</strong>
        </span>
        <span>
          Kilometer: <strong>{totalKmDriven > 0 ? `${totalKmDriven.toLocaleString('de-DE')} km` : EM_DASH}</strong>
        </span>
        <span className="ml-auto">
          Umsatz: <strong className="text-[color:var(--status-success)]">{formatCurrencyCents(totalRevenueCents)}</strong>
        </span>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Buchung', 'Fahrzeug', 'Zeitraum', 'Status', 'Preis', ''].map((h) => (
                <th key={h} className="text-left text-[10px] uppercase tracking-wider font-semibold px-3 py-2 text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {bookings.map((b) => {
              const statusLabel = bookingStatusLabelDe(b.status);
              const priceCents = computeBookingRevenueCents(b);
              const ref = b.bookingNumber || `#${b.id.slice(0, 8).toUpperCase()}`;
              return (
                <tr key={b.id} className="hover:bg-muted/40">
                  <td className="px-3 py-2 text-xs font-semibold">{ref}</td>
                  <td className="px-3 py-2 text-xs">
                    <p className="font-medium">{b.vehicle?.licensePlate || EM_DASH}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {[b.vehicle?.make, b.vehicle?.model].filter(Boolean).join(' ') || EM_DASH}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDate(b.startDate)} – {formatDate(b.endDate)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip tone={bookingStatusTone(statusLabel)}>{statusLabel}</StatusChip>
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold">
                    {priceCents > 0 ? formatCurrencyCents(priceCents, b.currency || 'EUR') : EM_DASH}
                  </td>
                  <td className="px-3 py-2">
                    {onOpenBooking && (
                      <button
                        type="button"
                        onClick={() => onOpenBooking(b.id)}
                        className="text-[10px] font-semibold text-[color:var(--brand)]"
                      >
                        Öffnen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
