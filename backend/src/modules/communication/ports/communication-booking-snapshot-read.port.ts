/**
 * Core-owned port — Communication Center reads minimal booking snapshot facts
 * without importing Rental BookingsService.
 */
export const COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT = Symbol(
  'COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT',
);

export type CommunicationBookingSnapshot = {
  bookingNumber: string;
  depositStatus: string | null;
  paymentStatus: string | null;
};

export interface CommunicationBookingSnapshotReadPort {
  getSnapshot(
    organizationId: string,
    bookingId: string,
  ): Promise<CommunicationBookingSnapshot | null>;
}