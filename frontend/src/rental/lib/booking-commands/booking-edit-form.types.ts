import type { OperatorBookingUpdatePayload } from '../../../lib/api';

/** Shared editable booking fields — same semantics across rental + operator UIs. */
export interface BookingEditFormState {
  startLocal: string;
  endLocal: string;
  notes: string;
  kmIncluded: string;
  pickupStationId: string;
  returnStationId: string;
  sameReturnStation: boolean;
  customerId?: string | null;
  vehicleId?: string | null;
  insuranceOptions?: string[];
  /** Display-only — never sent as financial truth without server quote. */
  paymentIntentLabel?: string | null;
}

export type BookingEditBaseline = {
  bookingId: string;
  updatedAt: string;
  startDate: string;
  endDate: string;
  notes: string | null;
  kmIncluded: number | null;
  pickupStationId: string | null;
  returnStationId: string | null;
  customerId?: string | null;
  vehicleId?: string | null;
  insuranceOptions?: string[];
};

export type BookingUpdateCommandResult =
  | { ok: true; patch: OperatorBookingUpdatePayload; changedFields: string[] }
  | { ok: false; error: string; fieldErrors?: Partial<Record<keyof BookingEditFormState, string>> };

export type BookingMutationErrorKind =
  | 'validation'
  | 'version_conflict'
  | 'permission_denied'
  | 'overlap'
  | 'rental_blocked'
  | 'pricing_quote_required'
  | 'status_command_required'
  | 'unknown';

export interface BookingMutationErrorView {
  kind: BookingMutationErrorKind;
  title: string;
  description: string;
}
