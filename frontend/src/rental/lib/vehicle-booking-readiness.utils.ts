import type { BookingDetailDto, BookingDetailDocumentSlot } from '../../lib/api';
import type { BookingUiStatus } from '../components/bookings/bookingStatus';
import { paymentStatusLabel, depositStatusLabel } from '../components/booking-detail/bookingDetailUtils';
import type { VehicleAgendaBooking } from './vehicle-booking-agenda.utils';

export type ReadinessCheckpointState = 'ok' | 'open' | 'warning' | 'blocked' | 'unavailable';

export interface ReadinessCheckpoint {
  id: string;
  label: string;
  state: ReadinessCheckpointState;
  hint?: string;
  icon: string;
}

const DOC_RENTAL_CONTRACT = 'RENTAL_CONTRACT';
const DOC_BOOKING_INVOICE = 'BOOKING_INVOICE';
const DOC_DEPOSIT_RECEIPT = 'DEPOSIT_RECEIPT';

export function pickNextHandoverBooking(
  bookings: VehicleAgendaBooking[],
): VehicleAgendaBooking | null {
  const active = bookings
    .filter((b) => b.status === 'active')
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
  if (active.length > 0) return active[0]!;

  const confirmed = bookings
    .filter((b) => b.status === 'confirmed')
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (confirmed.length > 0) return confirmed[0]!;

  const pending = bookings
    .filter((b) => b.status === 'pending')
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (pending.length > 0) return pending[0]!;

  return null;
}

function slotCheckpoint(
  detail: BookingDetailDto,
  documentType: string,
  label: string,
  icon: string,
  required = true,
): ReadinessCheckpoint | null {
  const slot = detail.documents.slots.find((s: BookingDetailDocumentSlot) => s.documentType === documentType);
  if (!slot) return null;

  if (slot.available) {
    if (slot.status === 'signed') {
      return { id: documentType, label, state: 'ok', icon, hint: 'Signiert' };
    }
    if (slot.status === 'generated') {
      return { id: documentType, label, state: 'warning', icon, hint: 'Erstellt — Signatur offen' };
    }
    return { id: documentType, label, state: 'ok', icon };
  }

  if (!slot.required) return null;

  return {
    id: documentType,
    label,
    state: slot.missingReason?.includes('Administration') ? 'blocked' : 'open',
    icon,
    hint: slot.missingReason ?? 'Noch nicht vorhanden',
  };
}

function legalBundleCheckpoint(detail: BookingDetailDto): ReadinessCheckpoint | null {
  const { legalTermsAttached, legalWithdrawalAttached, legalMissing } = detail.documents;
  if (legalTermsAttached && legalWithdrawalAttached) {
    return { id: 'legal', label: 'AGB/Widerruf', state: 'ok', icon: 'file-text' };
  }
  if (legalMissing.length > 0) {
    return {
      id: 'legal',
      label: 'AGB/Widerruf',
      state: 'blocked',
      icon: 'file-text',
      hint: legalMissing.join(', '),
    };
  }
  const terms = detail.documents.slots.find((s: BookingDetailDocumentSlot) => s.documentType === 'TERMS_AND_CONDITIONS');
  const withdrawal = detail.documents.slots.find((s: BookingDetailDocumentSlot) => s.documentType === 'WITHDRAWAL_INFORMATION');
  if (!terms && !withdrawal) return null;
  const ready = terms?.available && withdrawal?.available;
  return {
    id: 'legal',
    label: 'AGB/Widerruf',
    state: ready ? 'ok' : 'open',
    icon: 'file-text',
    hint: ready ? undefined : 'Dokumente im Bundle fehlen',
  };
}

function paymentCheckpoint(detail: BookingDetailDto): ReadinessCheckpoint | null {
  if (!detail.finance.computed || !detail.finance.paymentStatus) return null;
  const ps = detail.finance.paymentStatus.toUpperCase();
  let state: ReadinessCheckpointState = 'open';
  if (ps === 'PAID') state = 'ok';
  else if (ps === 'PARTIAL') state = 'warning';
  else if (ps === 'OVERDUE') state = 'blocked';
  return {
    id: 'payment',
    label: 'Zahlung',
    state,
    icon: 'credit-card',
    hint: paymentStatusLabel(detail.finance.paymentStatus),
  };
}

function depositCheckpoint(detail: BookingDetailDto): ReadinessCheckpoint | null {
  if (!detail.finance.computed) return null;
  if (!detail.finance.depositStatus && !(detail.finance.depositAmountCents && detail.finance.depositAmountCents > 0)) {
    return null;
  }
  const ds = detail.finance.depositStatus?.toUpperCase();
  let state: ReadinessCheckpointState = 'open';
  if (ds === 'RECEIVED' || ds === 'REFUNDED' || ds === 'PARTIALLY_REFUNDED') state = 'ok';
  else if (ds === 'PARTIALLY_USED' || ds === 'FORFEITED') state = 'warning';
  else if (ds === 'REQUESTED') state = 'open';
  return {
    id: 'deposit',
    label: 'Kaution',
    state,
    icon: 'shield',
    hint: depositStatusLabel(detail.finance.depositStatus),
  };
}

function eligibilityCheckpoint(detail: BookingDetailDto): ReadinessCheckpoint | null {
  if (!detail.eligibility) return null;
  return {
    id: 'eligibility',
    label: 'Kunde',
    state: detail.eligibility.canStartRental ? 'ok' : 'blocked',
    icon: 'user-check',
    hint: detail.eligibility.blockingReasons[0] ?? detail.eligibility.warnings[0],
  };
}

function handoverCheckpoint(
  side: 'pickup' | 'return',
  detail: BookingDetailDto | null,
  fallback: VehicleAgendaBooking,
  status: BookingUiStatus,
): ReadinessCheckpoint | null {
  const label = side === 'pickup' ? 'Pickup' : 'Return';
  const icon = side === 'pickup' ? 'key' : 'log-out';

  if (side === 'return' && status !== 'active') return null;

  const fromDetail = side === 'pickup' ? detail?.handover.pickup : detail?.handover.return;
  if (fromDetail) {
    return { id: `handover-${side}`, label, state: 'ok', icon, hint: 'Protokoll erfasst' };
  }

  const fromList = side === 'pickup' ? fallback.hasPickup : fallback.hasReturn;
  if (fromList) {
    return { id: `handover-${side}`, label, state: 'ok', icon, hint: 'Protokoll erfasst' };
  }

  if (side === 'return' && status === 'active' && !fallback.hasPickup && !detail?.handover.pickup) {
    return null;
  }

  if (status === 'completed' || status === 'cancelled' || status === 'no_show') return null;

  return { id: `handover-${side}`, label, state: 'open', icon, hint: 'Noch offen' };
}

function tasksCheckpoint(detail: BookingDetailDto): ReadinessCheckpoint | null {
  const { openCount, overdueCount } = detail.tasks;
  if (openCount <= 0 && overdueCount <= 0) return null;
  return {
    id: 'tasks',
    label: 'Tasks',
    state: overdueCount > 0 ? 'blocked' : 'warning',
    icon: 'check-square',
    hint: `${openCount} offen${overdueCount > 0 ? ` · ${overdueCount} überfällig` : ''}`,
  };
}

function healthCheckpoint(detail: BookingDetailDto): ReadinessCheckpoint | null {
  const { health, vehicle } = detail;
  if (!health.rentalBlocked && !vehicle.rentalBlocked && health.criticalWarnings.length === 0) {
    if (!health.overallState && health.warningWarnings.length === 0) return null;
    return {
      id: 'health',
      label: 'Mietbereitschaft',
      state: health.warningWarnings.length > 0 ? 'warning' : 'ok',
      icon: 'activity',
      hint: health.overallState ?? health.warningWarnings[0],
    };
  }

  if (health.rentalBlocked || vehicle.rentalBlocked) {
    const reasons = [...health.blockingReasons, ...vehicle.blockingReasons].filter(Boolean);
    return {
      id: 'health',
      label: 'Mietbereitschaft',
      state: 'blocked',
      icon: 'activity',
      hint: reasons.slice(0, 2).join(' · ') || 'Vermietung blockiert',
    };
  }

  return {
    id: 'health',
    label: 'Mietbereitschaft',
    state: 'warning',
    icon: 'activity',
    hint: health.criticalWarnings[0],
  };
}

export function buildReadinessCheckpoints(
  detail: BookingDetailDto | null,
  fallback: VehicleAgendaBooking,
): ReadinessCheckpoint[] {
  const status = fallback.status;
  const items: (ReadinessCheckpoint | null)[] = [];

  if (detail) {
    const hasDeposit =
      (detail.finance.depositAmountCents != null && detail.finance.depositAmountCents > 0) ||
      detail.documents.slots.some((s: BookingDetailDocumentSlot) => s.documentType === DOC_DEPOSIT_RECEIPT);

    items.push(
      slotCheckpoint(detail, DOC_RENTAL_CONTRACT, 'Mietvertrag', 'file-signature'),
      slotCheckpoint(detail, DOC_BOOKING_INVOICE, 'Rechnung', 'receipt'),
      hasDeposit
        ? slotCheckpoint(detail, DOC_DEPOSIT_RECEIPT, 'Kautionsbeleg', 'shield-check')
        : null,
      legalBundleCheckpoint(detail),
      eligibilityCheckpoint(detail),
      paymentCheckpoint(detail),
      depositCheckpoint(detail),
      handoverCheckpoint('pickup', detail, fallback, status),
      handoverCheckpoint('return', detail, fallback, status),
      tasksCheckpoint(detail),
      healthCheckpoint(detail),
    );
  } else {
    items.push(
      handoverCheckpoint('pickup', null, fallback, status),
      handoverCheckpoint('return', null, fallback, status),
    );
  }

  return items.filter((c): c is ReadinessCheckpoint => c != null);
}

export function readinessStateLabel(state: ReadinessCheckpointState): string {
  switch (state) {
    case 'ok':
      return 'OK';
    case 'open':
      return 'Offen';
    case 'warning':
      return 'Warnung';
    case 'blocked':
      return 'Blockiert';
    case 'unavailable':
      return 'Nicht verfügbar';
    default:
      return state;
  }
}
