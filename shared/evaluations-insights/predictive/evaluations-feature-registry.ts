/**
 * Feature definition registry — versioned, no PII features.
 */

import { CONTROLLED_HOLIDAY_SOURCE_VERSION } from './evaluations-feature-calendar';
import type { PredictiveFeatureDefinition } from './evaluations-feature-store.contract';

export const PREDICTIVE_FEATURE_REGISTRY_VERSION = 1;

const def = (
  key: string,
  valueType: PredictiveFeatureDefinition['valueType'],
  description: string,
  sources: string[],
  maxLateArrivalDays = 3,
): PredictiveFeatureDefinition => ({
  key,
  version: 1,
  valueType,
  pii: false,
  timeReference: 'observation_date_local',
  description,
  maxLateArrivalDays,
  sources,
});

export const PREDICTIVE_FEATURE_REGISTRY: PredictiveFeatureDefinition[] = [
  def('calendar.weekday', 'integer', 'Day of week (0=Sun) in org timezone', ['calendar']),
  def('calendar.month', 'integer', 'Month (1–12) in org timezone', ['calendar']),
  def('calendar.season', 'string', 'Meteorological season (northern hemisphere)', ['calendar']),
  def(
    'calendar.is_public_holiday',
    'boolean',
    'DE federal public holiday (controlled static table)',
    ['calendar', CONTROLLED_HOLIDAY_SOURCE_VERSION],
  ),
  def(
    'demand.booking_starts_count',
    'integer',
    'Bookings starting on observation day (PIT-safe)',
    ['Booking.startDate'],
  ),
  def(
    'demand.historical_7d_avg',
    'float',
    'Trailing 7-day average booking starts (excludes observation day)',
    ['Booking.startDate'],
  ),
  def(
    'demand.historical_30d_avg',
    'float',
    'Trailing 30-day average booking starts (excludes observation day)',
    ['Booking.startDate'],
  ),
  def(
    'bookings.lead_time_hours_avg',
    'float',
    'Average hours from createdAt to startDate for starts on observation day',
    ['Booking.createdAt', 'Booking.startDate'],
  ),
  def('bookings.cancellations_count', 'integer', 'Cancellations on observation day', ['Booking.cancelledAt']),
  def('bookings.no_show_count', 'integer', 'No-shows on observation day', ['Booking.cancelledAt']),
  def(
    'bookings.completed_count',
    'integer',
    'Completions on observation day',
    ['Booking.completedAt'],
    7,
  ),
  def('revenue.booking_minor', 'integer', 'Completed booking revenue on observation day (minor units)', [
    'Booking.totalPriceCents',
  ]),
  def('revenue.invoice_issued_minor', 'integer', 'Outgoing invoices issued on observation day', [
    'OrgInvoice.invoiceDate',
  ]),
  def('pricing.avg_booking_minor', 'float', 'Average completed booking price on observation day', [
    'Booking.totalPriceCents',
  ]),
  def(
    'utilization.rented_minutes',
    'integer',
    'Minutes vehicles were rented during observation day',
    ['Booking.startDate', 'Booking.endDate'],
  ),
  def(
    'utilization.capacity_vehicle_minutes',
    'integer',
    'Fleet capacity minutes (vehicles × day length)',
    ['Vehicle'],
  ),
  def(
    'utilization.percent',
    'percent',
    'Time-weighted utilization percent for observation day',
    ['Booking', 'Vehicle'],
  ),
  def('fleet.km_driven_total', 'integer', 'Km driven on completions during observation day', ['Booking.kmDriven']),
  def(
    'maintenance.events_opened_count',
    'integer',
    'Service cases opened on observation day',
    ['ServiceCase.openedAt'],
  ),
  def(
    'maintenance.cost_minor',
    'integer',
    'Maintenance/repair costs on cases opened observation day',
    ['ServiceCase.actualCostCents'],
    14,
  ),
  def(
    'downtime.minutes',
    'integer',
    'Blocked rental downtime minutes overlapping observation day',
    ['ServiceCase.downtimeStart', 'ServiceCase.downtimeEnd'],
  ),
  def(
    'scope.station_id',
    'string',
    'Station scope identifier when scoped',
    ['Station'],
    0,
  ),
  def(
    'scope.vehicle_class_id',
    'string',
    'Vehicle class scope identifier when scoped',
    ['RentalVehicleCategory'],
    0,
  ),
];

export const PREDICTIVE_FEATURE_REGISTRY_BY_KEY = new Map(
  PREDICTIVE_FEATURE_REGISTRY.map((f) => [f.key, f]),
);

export function listRegistryFeatureKeys(): string[] {
  return PREDICTIVE_FEATURE_REGISTRY.map((f) => f.key);
}
