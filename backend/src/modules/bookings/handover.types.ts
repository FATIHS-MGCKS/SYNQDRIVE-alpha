// V4.6.75 — Booking Handover Protocol contract (pickup + return).
// Payloads are intentionally lean: the operator workflow is
//   booking (CONFIRMED) → pickup handover → ACTIVE → return handover → COMPLETED
// so only the two POST payloads are exposed here; queries are served via
// the existing bookings list/detail routes.

export type HandoverKind = 'PICKUP' | 'RETURN';

export interface HandoverProtocolDto {
  id: string;
  bookingId: string;
  vehicleId: string;
  kind: HandoverKind;
  performedAt: string;
  performedByUserId: string | null;
  performedByName: string | null;
  odometerKm: number;
  fuelPercent: number;
  fuelFull: boolean;
  exteriorClean: boolean;
  interiorClean: boolean;
  tiresSeasonOk: boolean;
  warningLightsOn: boolean;
  warningLightsNotes: string | null;
  notes: string | null;
  customerSignatureName: string | null;
  customerSignatureDataUrl: string | null;
  staffSignatureName: string | null;
  staffSignatureDataUrl: string | null;
  documentsAcknowledged: boolean;
  damageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateHandoverProtocolPayload {
  // V4.6.81 — Backdate support. When the operator records a pickup that
  // physically happened earlier (customer arrived late, dispatcher logs
  // the handover after the fact, etc.), the UI sends `performedAt` as an
  // ISO-8601 timestamp. Omitted → server uses `now()` via the DB default.
  // The server enforces: not in the future, and not more than 7 days
  // before `booking.startDate` (see BookingsHandoverService).
  performedAt?: string | null;
  performedByUserId?: string | null;
  performedByName?: string | null;
  odometerKm: number;
  fuelPercent: number;
  fuelFull?: boolean;
  exteriorClean?: boolean;
  interiorClean?: boolean;
  tiresSeasonOk?: boolean;
  warningLightsOn?: boolean;
  warningLightsNotes?: string | null;
  notes?: string | null;
  customerSignatureName?: string | null;
  customerSignatureDataUrl?: string | null;
  staffSignatureName?: string | null;
  staffSignatureDataUrl?: string | null;
  documentsAcknowledged?: boolean;
  damageIds?: string[];
}
