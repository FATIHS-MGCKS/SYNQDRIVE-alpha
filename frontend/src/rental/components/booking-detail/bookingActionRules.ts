import type { BookingDetailDto } from '../../../lib/api';
import { normalizeBookingStatus } from '../bookings/bookingStatus';
import {
  deriveBookingPickupGate,
  deriveBookingReturnGate,
  type BookingHandoverGate,
} from '../../lib/bookingHandoverGates';
import type {
  BookingActionGate,
  BookingActionMatrix,
  BookingPrimaryAction,
} from './bookingDetailTypes';

function gate(allowed: boolean, reason?: string): BookingHandoverGate {
  return allowed ? { allowed: true } : { allowed: false, reason };
}

export function getBookingActionMatrix(detail: BookingDetailDto): BookingActionMatrix {
  const status = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  const hasPickup = Boolean(detail.handover.pickup);
  const hasReturn = Boolean(detail.handover.return);
  const rentalBlocked = detail.health.rentalBlocked || detail.vehicle.rentalBlocked;
  const legalOk =
    detail.documents.legalTermsAttached && detail.documents.legalWithdrawalAttached;

  const edit: BookingActionGate = (() => {
    if (status === 'cancelled' || status === 'no_show') {
      return gate(false, 'Stornierte oder No-Show-Buchungen sind nicht bearbeitbar');
    }
    if (status === 'completed') {
      return gate(false, 'Abgeschlossene Buchungen sind schreibgeschützt');
    }
    if (status === 'active') {
      return gate(false, 'Während aktiver Vermietung nur begrenzte Änderungen — Notizen separat');
    }
    return gate(true);
  })();

  const cancel: BookingActionGate = (() => {
    if (status === 'active' || status === 'completed' || status === 'cancelled' || status === 'no_show') {
      return gate(false, 'Stornierung in diesem Status nicht möglich');
    }
    return gate(true);
  })();

  const no_show: BookingActionGate = (() => {
    if (status !== 'confirmed' && status !== 'pending') {
      return gate(false, 'No-Show nur bei bestätigten oder ausstehenden Buchungen möglich');
    }
    if (hasPickup) return gate(false, 'Pickup bereits erfasst — No-Show nicht möglich');
    return gate(true);
  })();

  const pickup = deriveBookingPickupGate({
    statusEnum: detail.core.statusEnum,
    status: detail.core.status,
    hasPickupProtocol: hasPickup,
    hasReturnProtocol: hasReturn,
    rentalBlocked,
    blockingReasons: detail.health.blockingReasons,
    canStartRental: detail.eligibility?.canStartRental ?? null,
    eligibilityBlockingReasons: detail.eligibility?.blockingReasons,
  });

  const ret = deriveBookingReturnGate({
    statusEnum: detail.core.statusEnum,
    status: detail.core.status,
    hasPickupProtocol: hasPickup,
    hasReturnProtocol: hasReturn,
  });

  const final_invoice: BookingActionGate = (() => {
    if (status !== 'completed' && status !== 'active') {
      return gate(false, 'Schlussrechnung erst nach Rückgabe bzw. bei abgeschlossener Buchung');
    }
    if (!hasReturn && status !== 'completed') {
      return gate(false, 'Schlussrechnung erst nach Rückgabe möglich');
    }
    if (detail.finance.finalInvoiceStatus === 'PAID' || detail.finance.finalInvoiceStatus === 'SENT') {
      return gate(false, 'Schlussrechnung bereits erstellt');
    }
    return gate(true);
  })();

  const add_note: BookingActionGate = (() => {
    if (status === 'cancelled' || status === 'no_show') {
      return gate(true);
    }
    if (status === 'completed') return gate(true);
    return gate(true);
  })();

  void legalOk;

  return { edit, cancel, no_show, pickup, return: ret, final_invoice, add_note };
}

export function getPrimaryBookingAction(
  detail: BookingDetailDto,
  matrix: BookingActionMatrix,
): BookingPrimaryAction {
  if (matrix.pickup.allowed) return { key: 'pickup', label: 'Pickup starten' };
  if (matrix.return.allowed) return { key: 'return', label: 'Return starten' };
  if (matrix.no_show.allowed) return { key: 'no_show', label: 'No-Show markieren' };
  if (matrix.final_invoice.allowed) return { key: 'final_invoice', label: 'Schlussrechnung erstellen' };
  if (matrix.edit.allowed) return { key: 'edit', label: 'Bearbeiten' };
  return { key: 'none', label: 'Keine Aktion möglich' };
}

export function canGenerateContract(detail: BookingDetailDto): BookingActionGate {
  const status = normalizeBookingStatus(detail.core.statusEnum, detail.core.status);
  if (status === 'cancelled' || status === 'no_show') {
    return gate(false, 'Dokumente für stornierte Buchungen nicht verfügbar');
  }
  if (!detail.documents.legalTermsAttached || !detail.documents.legalWithdrawalAttached) {
    return gate(false, 'Mietvertrag kann nicht erstellt werden, weil AGB/Widerruf in Administration fehlt');
  }
  return gate(true);
}
