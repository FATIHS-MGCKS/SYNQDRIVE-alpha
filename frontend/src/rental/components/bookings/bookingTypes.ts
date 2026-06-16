import type { BookingUiRow } from '../../lib/entityMappers';

export type BookingApiStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type BookingPlannerView = 'timeline' | 'table' | 'calendar';

export type BookingStatusFilter =
  | 'all'
  | 'active'
  | 'confirmed'
  | 'pending'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface BookingFiltersState {
  search: string;
  status: BookingStatusFilter;
  vehicleId: string | null;
  stationId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  showTerminal: boolean;
}

export interface BookingFinanceSummary {
  grossAmountCents: number | null;
  currency: string;
  paidAmountCents: number | null;
  openAmountCents: number | null;
  depositAmountCents: number | null;
  paymentStatus: 'unknown' | 'open' | 'paid' | 'partial';
  invoiceStatus: 'unknown' | 'missing' | 'draft' | 'sent' | 'paid';
}

export type { BookingUiRow };
