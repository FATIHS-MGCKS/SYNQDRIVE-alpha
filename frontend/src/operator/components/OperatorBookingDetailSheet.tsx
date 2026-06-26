import { useEffect, useState } from 'react';
import { Loader2, Pencil, X, Ban, UserX, ClipboardCheck } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import { api, type BookingDetailDto } from '../../lib/api';
import { useRentalOrg } from '../../rental/RentalContext';
import { getBookingActionMatrix } from '../../rental/components/booking-detail/bookingActionRules';
import {
  bookingStatusLabel,
  normalizeBookingStatus,
} from '../../rental/components/bookings/bookingStatus';
import { useOperatorShell } from '../context/OperatorShellContext';
import { canOperatorMarkNoShow } from '../bookings/operatorBooking.utils';
import { OperatorBookingDocumentsPanel } from '../documents/OperatorBookingDocumentsPanel';
import type { OperatorTodayBookingItem } from '../lib/operatorData';
import { OperatorGlassCard } from './OperatorGlassCard';

interface OperatorBookingDetailSheetProps {
  item: OperatorTodayBookingItem | null;
  onClose: () => void;
  onPickupStart: (item: OperatorTodayBookingItem) => void;
  onReturnStart: (item: OperatorTodayBookingItem) => void;
}

export function OperatorBookingDetailSheet({
  item,
  onClose,
  onPickupStart,
  onReturnStart,
}: OperatorBookingDetailSheetProps) {
  const { orgId } = useRentalOrg();
  const { openSheet, triggerRefresh } = useOperatorShell();
  const [detail, setDetail] = useState<BookingDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item || !orgId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.bookings
      .detail(orgId, item.bookingId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Details nicht verfügbar');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item, orgId]);

  if (!item) return null;

  const matrix = detail ? getBookingActionMatrix(detail) : null;
  const pickupGate = matrix?.pickup ?? item.pickupGate;
  const returnGate = matrix?.return ?? item.returnGate;
  const status = detail
    ? normalizeBookingStatus(detail.core.statusEnum, detail.core.status)
    : item.status;
  const noShowGate = detail ? canOperatorMarkNoShow(detail) : { allowed: false };

  const openBookingAction = (
    type: 'booking-edit' | 'booking-cancel' | 'booking-no-show',
  ) => {
    onClose();
    openSheet({
      type,
      bookingId: item.bookingId,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-modal
    >
      <header className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Buchung</p>
          <h2 className="truncate text-base font-bold text-foreground">
            {item.vehicleName} · {item.plate}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-5 space-y-4">
        <OperatorGlassCard className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <StatusChip tone="info" dot>
              {bookingStatusLabel(status)}
            </StatusChip>
            <StatusChip tone="neutral">
              {!item.station ? 'Buchung' : item.kind === 'PICKUP' ? 'Abholung' : 'Rückgabe'}
            </StatusChip>
          </div>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Kunde</dt>
              <dd className="font-medium">{item.customerName}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Station</dt>
              <dd>
                {(detail?.core.pickupStationName ??
                  detail?.core.returnStationName ??
                  item.station) ||
                  '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase text-muted-foreground">Zeit</dt>
              <dd>{item.timeLabel}</dd>
            </div>
          </dl>
        </OperatorGlassCard>

        {loading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {error && <p className="text-sm text-[color:var(--status-critical)]">{error}</p>}

        {detail && detail.health.rentalBlocked && (
          <OperatorGlassCard className="border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] p-4">
            <p className="text-sm font-semibold text-[color:var(--status-critical)]">Fahrzeug blockiert</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {detail.health.blockingReasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </OperatorGlassCard>
        )}

        <OperatorGlassCard className="p-4">
          <OperatorBookingDocumentsPanel
            orgId={orgId}
            bookingId={item.bookingId}
            customerId={detail?.customer.customerId}
            onAiUpload={() => {
              if (!detail) return;
              openSheet({
                type: 'ai-upload',
                vehicleId: detail.vehicle.vehicleId,
                vehicleLabel: `${detail.vehicle.displayName} · ${detail.vehicle.licensePlate ?? ''}`,
                bookingId: detail.core.bookingId,
                customerId: detail.customer.customerId,
                customerName: detail.customer.fullName ?? item.customerName,
                contextMode: 'booking',
              });
            }}
          />
        </OperatorGlassCard>

        {detail && item.kind === 'PICKUP' && (
          <OperatorGlassCard className="p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Dokumentenprüfung
            </p>
            <button
              type="button"
              onClick={() =>
                openSheet({
                  type: 'pickup-verification',
                  customerId: detail.customer.customerId,
                  bookingId: detail.core.bookingId,
                  customerName: detail.customer.fullName ?? item.customerName,
                  onSuccess: () => triggerRefresh(),
                })
              }
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border/60 px-4 text-left"
            >
              <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold">Prüfung beim Pickup erfassen</span>
            </button>
          </OperatorGlassCard>
        )}

        {detail && matrix && (
          <OperatorGlassCard className="space-y-2 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Buchung verwalten
            </p>
            <button
              type="button"
              disabled={!matrix.edit.allowed}
              title={matrix.edit.reason}
              onClick={() => openBookingAction('booking-edit')}
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border/60 px-4 text-left disabled:opacity-45"
            >
              <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold">Bearbeiten</span>
            </button>
            <button
              type="button"
              disabled={!matrix.cancel.allowed}
              title={matrix.cancel.reason}
              onClick={() => openBookingAction('booking-cancel')}
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[color:var(--status-critical)]/30 px-4 text-left disabled:opacity-45"
            >
              <Ban className="h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
              <span className="text-sm font-semibold text-[color:var(--status-critical)]">
                Buchung stornieren
              </span>
            </button>
            <button
              type="button"
              disabled={!noShowGate.allowed}
              title={noShowGate.reason}
              onClick={() => openBookingAction('booking-no-show')}
              className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-[color:var(--status-critical)]/30 px-4 text-left disabled:opacity-45"
            >
              <UserX className="h-4 w-4 shrink-0 text-[color:var(--status-critical)]" />
              <span className="text-sm font-semibold text-[color:var(--status-critical)]">
                No-Show markieren
              </span>
            </button>
          </OperatorGlassCard>
        )}

        <div className="grid gap-2">
          <button
            type="button"
            disabled={!pickupGate.allowed}
            title={pickupGate.reason}
            onClick={() => {
              onClose();
              onPickupStart(item);
            }}
            className="sq-3d-btn sq-3d-btn--primary min-h-[48px] font-semibold disabled:opacity-45"
          >
            Pickup starten
          </button>
          <button
            type="button"
            disabled={!returnGate.allowed}
            title={returnGate.reason}
            onClick={() => {
              onClose();
              onReturnStart(item);
            }}
            className="sq-3d-btn sq-3d-btn--neutral min-h-[48px] font-semibold disabled:opacity-45"
          >
            Return starten
          </button>
        </div>
      </div>
    </div>
  );
}
