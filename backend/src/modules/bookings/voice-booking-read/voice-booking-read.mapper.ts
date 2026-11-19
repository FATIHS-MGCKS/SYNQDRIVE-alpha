import type { VoiceBookingDetailRead, VoiceBookingListItemRead } from '@modules/voice-mcp-gateway/ports/voice-booking-read.port';

type BookingListRowLike = Record<string, unknown> & {
  id: string;
  vehicleId: string;
  status: string;
  statusEnum?: string;
  customerName?: string;
  vehicleName?: string;
  vehicleLicense?: string;
  pickupStationName?: string | null;
  returnStationName?: string | null;
  station?: string | null;
  startDate: string;
  endDate: string;
};

type BookingDetailRowLike = BookingListRowLike & {
  customerId: string;
};

export function mapBookingListRowToVoiceRead(row: BookingListRowLike): VoiceBookingListItemRead {
  const pickup = row.pickupStationName ?? row.station ?? null;
  return {
    id: String(row.id),
    vehicleId: String(row.vehicleId),
    status: String(row.status),
    statusEnum: String(row.statusEnum ?? row.status),
    customerName: String(row.customerName ?? ''),
    vehicleName: String(row.vehicleName ?? ''),
    vehicleLicense: String(row.vehicleLicense ?? ''),
    pickupStationName: pickup,
    returnStationName: row.returnStationName ?? null,
    station: pickup,
    startDate: String(row.startDate),
    endDate: String(row.endDate),
  };
}

export function mapBookingDetailToVoiceRead(row: BookingDetailRowLike): VoiceBookingDetailRead {
  return {
    ...mapBookingListRowToVoiceRead(row),
    customerId: String(row.customerId),
  };
}