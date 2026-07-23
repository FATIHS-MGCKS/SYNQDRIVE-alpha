import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { api, type BookingDetailDto } from '../../lib/api';
import { bookingStatusLabel, normalizeBookingStatus } from '../../rental/components/bookings/bookingStatus';
import { useRentalOrg } from '../../rental/RentalContext';
import { StatusChip } from '../../components/patterns';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import { useOperatorShell } from '../context/OperatorShellContext';
import { useOperatorBookingMutations } from '../hooks/useOperatorBookingMutations';
import type { OperatorSheetAction } from '../lib/operatorTypes';
import { OperatorBookingSheetShell } from './operatorBookingSheetShell';
import { canOperatorMarkNoShow, toLocalDateTimeInput } from './operatorBooking.utils';

interface OperatorBookingNoShowSheetProps {
  action: Extract<OperatorSheetAction, { type: 'booking-no-show' }>;
}

export function OperatorBookingNoShowSheet({ action }: OperatorBookingNoShowSheetProps) {
  const { orgId } = useRentalOrg();
  const { closeSheet } = useOperatorShell();
  const { mutating, error, clearError, markNoShow } = useOperatorBookingMutations();
  const [detail, setDetail] = useState<BookingDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const bookingId = action.bookingId;

  useEffect(() => {
    if (!orgId || !bookingId) {
      setLoading(false);
      setLoadError('Buchung nicht angegeben');
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.bookings
      .detail(orgId, bookingId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Details nicht verfügbar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, bookingId]);

  const noShowGate = detail ? canOperatorMarkNoShow(detail) : { allowed: false, reason: 'Laden…' };
  const status = detail
    ? normalizeBookingStatus(detail.core.statusEnum, detail.core.status)
    : null;

  const handleConfirm = async () => {
    if (!bookingId || !noShowGate.allowed) return;
    clearError();
    await markNoShow(
      bookingId,
      detail.core.updatedAt,
      detail?.vehicle.vehicleId,
      reason.trim() || undefined,
      () => {
        action.onSuccess?.();
        closeSheet();
      },
    );
  };

  return (
    <OperatorBookingSheetShell title="No-Show markieren" onClose={closeSheet}>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : loadError || !detail ? (
        <p className="text-sm text-[color:var(--status-critical)]">{loadError ?? 'Buchung nicht gefunden'}</p>
      ) : (
        <div className="space-y-4 pb-4">
          <OperatorGlassCard className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <StatusChip tone="neutral">{detail.core.bookingNumber}</StatusChip>
              {status && <StatusChip tone="info">{bookingStatusLabel(status)}</StatusChip>}
            </div>
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Kunde</dt>
                <dd className="font-medium">{detail.customer.fullName}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Fahrzeug</dt>
                <dd>
                  {detail.vehicle.displayName} · {detail.vehicle.licensePlate}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Geplanter Pickup</dt>
                <dd>{toLocalDateTimeInput(detail.core.startDate).replace('T', ' ')}</dd>
              </div>
            </dl>
          </OperatorGlassCard>

          <OperatorGlassCard className="flex gap-3 border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--status-critical)]" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">Kunde nicht erschienen</p>
              <p className="mt-1 text-muted-foreground">
                No-Show bedeutet: Der Kunde ist zum geplanten Abholzeitpunkt nicht erschienen. Das ist
                keine normale Stornierung und wird separat ausgewertet.
              </p>
            </div>
          </OperatorGlassCard>

          {!noShowGate.allowed && (
            <OperatorGlassCard className="border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
              <p className="text-sm font-semibold text-[color:var(--status-critical)]">
                No-Show nicht möglich
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{noShowGate.reason}</p>
            </OperatorGlassCard>
          )}

          {noShowGate.allowed && (
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Grund (optional)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="z. B. Keine Antwort, nicht am Schalter…"
                className="mt-1 min-h-[80px] w-full rounded-xl border border-border surface-premium px-3 py-3 text-sm resize-none"
              />
            </label>
          )}

          {error && <p className="text-sm text-[color:var(--status-critical)]">{error}</p>}

          <div className="grid gap-2 pt-2">
            <button
              type="button"
              disabled={!noShowGate.allowed || mutating}
              onClick={() => void handleConfirm()}
              className="sq-3d-btn sq-3d-btn--destructive min-h-[48px] font-semibold disabled:opacity-45"
            >
              {mutating ? 'Speichere…' : 'No-Show markieren'}
            </button>
            <button
              type="button"
              onClick={closeSheet}
              className="sq-3d-btn sq-3d-btn--neutral min-h-[48px] font-semibold"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </OperatorBookingSheetShell>
  );
}
