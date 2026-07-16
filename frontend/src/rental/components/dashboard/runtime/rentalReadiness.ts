import type { VehicleData } from '../../../data/vehicles';
import {
  VEHICLE_DATA_QUALITY_STATE,
  VEHICLE_OPERATIONAL_STATUS,
  type VehicleBookingReference,
  type VehicleDataQualityState,
} from '../../../lib/vehicle-operational-state';
import type {
  RentalBlockLevel,
  RuntimeReason,
  RuntimeReasonCategory,
  TelemetryConnectionState,
  VehicleOperationalStatus,
} from './dashboardRuntimeTypes';
import { createRuntimeReason } from './dashboardRuntimeReasons';

/** Info-only reason source — must never block current readiness. */
export const RENTAL_READINESS_NEXT_BOOKING_INFO_SOURCE = 'vehicle-runtime:next-booking-info';

export interface RentalReadinessOperationalBlock {
  canonicalStatus: (typeof VEHICLE_OPERATIONAL_STATUS)[keyof typeof VEHICLE_OPERATIONAL_STATUS];
  backendDataQualityState: VehicleDataQualityState | null;
  isReliable: boolean;
}

const READINESS_BLOCKING_CATEGORIES = new Set<RuntimeReasonCategory>([
  'compliance',
  'damage',
  'rental',
]);

export interface DeriveReadyForRentingInput {
  operationalBlock: RentalReadinessOperationalBlock;
  operationalStatus: VehicleOperationalStatus;
  cleaningStatus: VehicleData['cleaningStatus'];
  blockLevel: RentalBlockLevel;
  reasons: RuntimeReason[];
  telemetryState: TelemetryConnectionState;
  nextBooking: VehicleBookingReference | null;
}

export function isBackendOperationalDataQualityReliable(
  block: Pick<RentalReadinessOperationalBlock, 'backendDataQualityState' | 'isReliable'>,
): boolean {
  if (block.backendDataQualityState === VEHICLE_DATA_QUALITY_STATE.RELIABLE) return true;
  if (block.backendDataQualityState == null && block.isReliable) return true;
  return false;
}

export function reasonBlocksReadyForRenting(reason: RuntimeReason): boolean {
  if (reason.source === RENTAL_READINESS_NEXT_BOOKING_INFO_SOURCE) return false;
  if (reason.preventsReady === true) return true;
  if (reason.blocking === true) return true;
  if (reason.severity === 'critical' && READINESS_BLOCKING_CATEGORIES.has(reason.category)) {
    return true;
  }
  return false;
}

/**
 * Current operative rental readiness — not future time-window bookability.
 * A future `nextBooking` alone never blocks readiness.
 */
export function deriveIsReadyForRenting(input: DeriveReadyForRentingInput): boolean {
  if (input.operationalStatus !== 'available') return false;
  if (input.operationalBlock.canonicalStatus !== VEHICLE_OPERATIONAL_STATUS.AVAILABLE) return false;

  if (!isBackendOperationalDataQualityReliable(input.operationalBlock)) return false;

  if (input.cleaningStatus !== 'Clean') return false;

  if (input.blockLevel !== 'none') return false;

  if (input.telemetryState === 'offline') return false;

  const readinessBlockers = input.reasons.filter(reasonBlocksReadyForRenting);
  if (readinessBlockers.length > 0) return false;

  return true;
}

export function buildNextBookingInfoReason(
  nextBooking: VehicleBookingReference,
  locale: string,
): RuntimeReason {
  const de = locale === 'de';
  const pickup = nextBooking.pickupAt
    ? new Date(nextBooking.pickupAt).toLocaleString(de ? 'de-DE' : 'en-US', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return createRuntimeReason({
    category: 'handover',
    severity: 'info',
    title: de ? 'Nächste Buchung' : 'Next booking',
    description: pickup
      ? `${nextBooking.customerName ?? (de ? 'Kunde' : 'Customer')} · ${pickup}`
      : nextBooking.customerName ?? undefined,
    source: RENTAL_READINESS_NEXT_BOOKING_INFO_SOURCE,
    blocking: false,
    preventsReady: false,
  });
}
