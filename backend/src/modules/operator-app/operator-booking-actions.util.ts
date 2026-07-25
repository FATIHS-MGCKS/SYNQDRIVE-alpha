import type { BookingDetailDto } from '@modules/bookings/booking-detail.types';

export interface OperatorActionGate {
  allowed: boolean;
  reason: string | null;
}

export interface OperatorBookingActions {
  edit: OperatorActionGate;
  cancel: OperatorActionGate;
  markNoShow: OperatorActionGate;
}

function gate(allowed: boolean, reason?: string | null): OperatorActionGate {
  return { allowed, reason: allowed ? null : (reason ?? 'Nicht erlaubt') };
}

function normalizeStatus(statusEnum: string, status: string): string {
  const raw = (statusEnum || status || '').toLowerCase();
  if (raw === 'no_show' || raw === 'noshow') return 'no_show';
  return raw;
}

export function buildOperatorBookingActions(detail: BookingDetailDto): OperatorBookingActions {
  const status = normalizeStatus(detail.core.statusEnum, detail.core.status);
  const hasPickup = Boolean(detail.handover.pickup);
  const hasReturn = Boolean(detail.handover.return);

  const edit = (() => {
    if (status === 'cancelled' || status === 'no_show') {
      return gate(false, 'Stornierte oder No-Show-Buchungen sind nicht bearbeitbar');
    }
    if (status === 'completed') {
      return gate(false, 'Abgeschlossene Buchungen sind schreibgeschützt');
    }
    if (status === 'active') {
      return gate(false, 'Während aktiver Vermietung nur begrenzte Änderungen');
    }
    return gate(true);
  })();

  const cancel = (() => {
    if (status === 'active' || status === 'completed' || status === 'cancelled' || status === 'no_show') {
      return gate(false, 'Stornierung in diesem Status nicht möglich');
    }
    return gate(true);
  })();

  const markNoShow = (() => {
    if (status !== 'confirmed') {
      return gate(false, 'No-Show nur bei bestätigten Buchungen möglich');
    }
    if (hasPickup) {
      return gate(false, 'Pickup bereits erfasst');
    }
    const startMs = new Date(detail.core.startDate).getTime();
    if (Number.isNaN(startMs) || startMs > Date.now()) {
      return gate(false, 'Geplanter Abholzeitpunkt liegt noch in der Zukunft');
    }
    return gate(true);
  })();

  return { edit, cancel, markNoShow };
}
