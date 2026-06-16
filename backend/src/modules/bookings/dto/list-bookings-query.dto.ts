import { BookingStatus } from '@prisma/client';

export interface ListBookingsQueryDto {
  page?: number;
  limit?: number;
  status?: BookingStatus | BookingStatus[];
  vehicleId?: string;
  customerId?: string;
  stationId?: string;
  from?: string;
  to?: string;
  search?: string;
}
