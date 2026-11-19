/**
 * Core-owned port — Voice MCP reads booking list/detail projections
 * without importing Rental BookingsService.
 */
export const VOICE_BOOKING_READ_PORT = Symbol('VOICE_BOOKING_READ_PORT');

export type VoiceBookingListQuery = {
  search?: string;
  page?: number;
  limit?: number;
};

/** Fields exposed to Voice MCP search and status tools (not full list DTO). */
export type VoiceBookingListItemRead = {
  id: string;
  vehicleId: string;
  status: string;
  statusEnum: string;
  customerName: string;
  vehicleName: string;
  vehicleLicense: string;
  pickupStationName: string | null;
  returnStationName: string | null;
  /** Legacy pickup station alias used by MCP formatters. */
  station: string | null;
  startDate: string;
  endDate: string;
};

export type VoiceBookingListResult = {
  data: VoiceBookingListItemRead[];
  total: number;
};

/** Detail slice for status + write-tool resolution (includes customerId). */
export type VoiceBookingDetailRead = VoiceBookingListItemRead & {
  customerId: string;
};

export interface VoiceBookingReadPort {
  searchBookings(
    organizationId: string,
    query: VoiceBookingListQuery,
  ): Promise<VoiceBookingListResult>;

  getBookingById(
    organizationId: string,
    bookingId: string,
  ): Promise<VoiceBookingDetailRead | null>;
}