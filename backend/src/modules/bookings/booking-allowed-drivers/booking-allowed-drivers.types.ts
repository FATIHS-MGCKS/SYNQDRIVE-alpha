import type { BookingDriverRole } from '@prisma/client';

export type BookingAllowedDriverRow = {
  id: string;
  customerId: string;
  role: BookingDriverRole;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  addedByUserId?: string | null;
  createdAt: Date;
};

export function formatDriverName(input: {
  firstName?: string | null;
  lastName?: string | null;
  fallbackId?: string;
}): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim();
  return name || input.fallbackId || 'Unknown driver';
}

export type BookingDriverPool = {
  bookingCustomerId: string;
  primaryDriverId: string | null;
  additionalDriverIds: string[];
  allowedDriverIds: string[];
};

export type BookingDriverHistoryTrip = {
  tripId: string;
  vehicleId: string;
  startTime: Date;
  endTime: Date | null;
  actualDriverId: string | null;
  assignedDriverId: string | null;
  bookingId: string | null;
};
