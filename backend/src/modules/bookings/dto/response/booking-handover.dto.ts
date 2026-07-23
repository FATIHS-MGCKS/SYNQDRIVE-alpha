import type { HandoverSignatureSummary } from '../../signature/booking-handover-signature.types';

/** Lean handover projection for list/calendar/timeline surfaces. */
export interface BookingHandoverSummaryDto {
  protocolId: string;
  kind: 'PICKUP' | 'RETURN';
  completedAt: string;
  protocolCompleted: boolean;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  damageCount: number;
}

/** Detail handover side projection (no signature blobs). */
export interface BookingHandoverSideDto {
  protocolId: string;
  status: 'completed';
  completedAt: string;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  damageCount: number;
  protocolCompleted: boolean;
  customerSignature: HandoverSignatureSummary;
  staffSignature: HandoverSignatureSummary;
  performedByName: string | null;
}

export interface BookingHandoverDto {
  pickup: BookingHandoverSideDto | null;
  return: BookingHandoverSideDto | null;
}
