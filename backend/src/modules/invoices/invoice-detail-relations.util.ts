import type { Customer, Vehicle } from '@prisma/client';
import { bookingRef } from '@modules/documents/templates/template-helpers';
import { vehicleDisplayName as centralVehicleDisplayName } from '@modules/rental-rules/rental-rules.mapper';
import type {
  InvoiceBookingStationSummaryDto,
  InvoiceBookingSummaryDto,
  InvoiceCustomerSummaryDto,
  InvoiceEntityNavigationDto,
  InvoiceRelationDivergenceDto,
  InvoiceRelationSnapshotsDto,
  InvoiceVehicleSummaryDto,
  RelationAvailability,
} from './invoice-detail.types';

const VEHICLE_UNAVAILABLE_LABEL = 'Fahrzeugdaten nicht verfügbar';
const CUSTOMER_UNAVAILABLE_LABEL = 'Kunde nicht mehr verfügbar';
const BOOKING_UNAVAILABLE_LABEL = 'Buchung nicht mehr verfügbar';

export type CustomerRow = Pick<
  Customer,
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'company'
  | 'status'
  | 'customerType'
  | 'archivedAt'
>;

export type VehicleRow = Pick<
  Vehicle,
  'id' | 'make' | 'model' | 'year' | 'licensePlate' | 'vin' | 'vehicleName' | 'status'
>;

export type BookingRow = {
  id: string;
  customerId: string;
  status: string;
  startDate: Date;
  endDate: Date;
  pickupStationId: string | null;
  returnStationId: string | null;
  pickupStation?: { id: string; name: string; code: string | null } | null;
  returnStation?: { id: string; name: string; code: string | null } | null;
};

export function customerNumberFromId(customerId: string): string {
  return `K-${customerId.slice(0, 8).toUpperCase()}`;
}

export function bookingNumberFromId(bookingId: string): string {
  return `BK-${bookingId.slice(-6).toUpperCase()}`;
}

export function parseInvoiceRelationSnapshots(extractedData: unknown): InvoiceRelationSnapshotsDto {
  if (!extractedData || typeof extractedData !== 'object') {
    return {};
  }
  const raw = extractedData as Record<string, unknown>;
  return {
    customerDisplayName:
      typeof raw.customerName === 'string'
        ? raw.customerName
        : typeof raw.customerDisplayName === 'string'
          ? raw.customerDisplayName
          : null,
    companyName: typeof raw.companyName === 'string' ? raw.companyName : null,
    vehicleDisplayName:
      typeof raw.vehicleDisplayName === 'string' ? raw.vehicleDisplayName : null,
    licensePlate:
      typeof raw.licensePlate === 'string'
        ? raw.licensePlate
        : typeof raw.vehiclePlate === 'string'
          ? raw.vehiclePlate
          : null,
    vehicleMake: typeof raw.vehicleMake === 'string' ? raw.vehicleMake : null,
    vehicleModel: typeof raw.vehicleModel === 'string' ? raw.vehicleModel : null,
  };
}

function customerAvailability(c: CustomerRow | null, linkedId: string | null): RelationAvailability {
  if (!linkedId) return 'MISSING';
  if (!c) return 'DELETED';
  if (c.archivedAt) return 'ARCHIVED';
  return 'AVAILABLE';
}

function vehicleAvailability(v: VehicleRow | null, linkedId: string | null): RelationAvailability {
  if (!linkedId) return 'MISSING';
  if (!v) return 'DELETED';
  if (v.status === 'OUT_OF_SERVICE') return 'ARCHIVED';
  return 'AVAILABLE';
}

function bookingAvailability(b: BookingRow | null, linkedId: string | null): RelationAvailability {
  if (!linkedId) return 'MISSING';
  if (!b) return 'DELETED';
  if (b.status === 'CANCELLED' || b.status === 'NO_SHOW') return 'ARCHIVED';
  return 'AVAILABLE';
}

function buildPersonDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
  const person = [firstName, lastName].filter(Boolean).join(' ').trim();
  return person || null;
}

function resolveCustomerDisplayName(args: {
  customer: CustomerRow | null;
  linkedId: string | null;
  snapshots: InvoiceRelationSnapshotsDto;
  preferCompany: boolean;
}): string {
  const { customer, linkedId, snapshots, preferCompany } = args;
  if (customer) {
    const person = buildPersonDisplayName(customer.firstName, customer.lastName);
    if (preferCompany && customer.company?.trim()) return customer.company.trim();
    if (person) return person;
    if (customer.company?.trim()) return customer.company.trim();
    return CUSTOMER_UNAVAILABLE_LABEL;
  }
  if (!linkedId) return CUSTOMER_UNAVAILABLE_LABEL;
  if (snapshots.customerDisplayName?.trim()) return snapshots.customerDisplayName.trim();
  if (snapshots.companyName?.trim()) return snapshots.companyName.trim();
  return CUSTOMER_UNAVAILABLE_LABEL;
}

export function formatCentralVehicleDisplayName(
  vehicle: VehicleRow | null,
  snapshots: InvoiceRelationSnapshotsDto,
): string {
  if (vehicle) {
    const fromCentral = centralVehicleDisplayName({
      vehicleName: vehicle.vehicleName,
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate,
    });
    if (fromCentral && fromCentral !== 'Vehicle') return fromCentral;
    if (vehicle.licensePlate?.trim()) return vehicle.licensePlate.trim();
    const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
    if (makeModel) return makeModel;
    return VEHICLE_UNAVAILABLE_LABEL;
  }
  if (snapshots.vehicleDisplayName?.trim()) return snapshots.vehicleDisplayName.trim();
  const plate = snapshots.licensePlate?.trim();
  if (plate) return plate;
  const makeModel = [snapshots.vehicleMake, snapshots.vehicleModel].filter(Boolean).join(' ').trim();
  if (makeModel) return makeModel;
  return VEHICLE_UNAVAILABLE_LABEL;
}

function mapStation(
  station: { id: string; name: string; code: string | null } | null | undefined,
): InvoiceBookingStationSummaryDto | null {
  if (!station) return null;
  return {
    id: station.id,
    name: station.name,
    code: station.code,
  };
}

export function mapInvoiceCustomerSummary(args: {
  customerId: string | null;
  customer: CustomerRow | null;
  snapshots: InvoiceRelationSnapshotsDto;
}): InvoiceCustomerSummaryDto | null {
  if (!args.customerId) return null;
  const availability = customerAvailability(args.customer, args.customerId);
  const preferCompany = args.customer?.customerType === 'CORPORATE';
  return {
    id: args.customer?.id ?? args.customerId,
    availability,
    displayName: resolveCustomerDisplayName({
      customer: args.customer,
      linkedId: args.customerId,
      snapshots: args.snapshots,
      preferCompany,
    }),
    firstName: args.customer?.firstName ?? null,
    lastName: args.customer?.lastName ?? null,
    companyName: args.customer?.company ?? args.snapshots.companyName ?? null,
    customerNumber: customerNumberFromId(args.customerId),
    email: args.customer?.email ?? null,
    phone: args.customer?.phone ?? null,
    status: args.customer?.status ?? null,
    navigation:
      availability === 'DELETED'
        ? null
        : {
            entityId: args.customerId,
            routeKey: 'customer-detail',
            label: resolveCustomerDisplayName({
              customer: args.customer,
              linkedId: args.customerId,
              snapshots: args.snapshots,
              preferCompany,
            }),
          },
  };
}

export function mapInvoiceBookingSummary(args: {
  bookingId: string | null;
  booking: BookingRow | null;
}): InvoiceBookingSummaryDto | null {
  if (!args.bookingId) return null;
  const availability = bookingAvailability(args.booking, args.bookingId);
  const id = args.booking?.id ?? args.bookingId;
  return {
    id,
    availability,
    bookingNumber: bookingNumberFromId(id),
    reference: bookingRef(id),
    startDate: args.booking?.startDate.toISOString() ?? '',
    endDate: args.booking?.endDate.toISOString() ?? '',
    status: args.booking?.status ?? 'UNKNOWN',
    pickupStation: mapStation(args.booking?.pickupStation),
    returnStation: mapStation(args.booking?.returnStation),
    bookingCustomerId: args.booking?.customerId ?? null,
    navigation:
      availability === 'DELETED'
        ? null
        : {
            entityId: id,
            routeKey: 'bookings',
            label: bookingNumberFromId(id),
          },
    unavailableLabel: availability === 'DELETED' ? BOOKING_UNAVAILABLE_LABEL : null,
  };
}

export function mapInvoiceVehicleSummary(args: {
  vehicleId: string | null;
  vehicle: VehicleRow | null;
  snapshots: InvoiceRelationSnapshotsDto;
  includeVin: boolean;
}): InvoiceVehicleSummaryDto | null {
  if (!args.vehicleId) return null;
  const availability = vehicleAvailability(args.vehicle, args.vehicleId);
  const displayName = formatCentralVehicleDisplayName(args.vehicle, args.snapshots);
  return {
    id: args.vehicle?.id ?? args.vehicleId,
    availability,
    displayName,
    make: args.vehicle?.make ?? args.snapshots.vehicleMake ?? null,
    model: args.vehicle?.model ?? args.snapshots.vehicleModel ?? null,
    modelYear: args.vehicle?.year ?? null,
    licensePlate: args.vehicle?.licensePlate ?? args.snapshots.licensePlate ?? null,
    fleetName: args.vehicle?.vehicleName ?? null,
    vin: args.includeVin ? args.vehicle?.vin ?? null : null,
    status: args.vehicle?.status ?? null,
    navigation:
      availability === 'DELETED'
        ? null
        : {
            entityId: args.vehicleId,
            routeKey: 'fleet',
            label: displayName,
          },
    unavailableLabel: displayName === VEHICLE_UNAVAILABLE_LABEL ? VEHICLE_UNAVAILABLE_LABEL : null,
  };
}

export function buildCustomerDivergence(args: {
  invoiceCustomerId: string | null;
  booking: BookingRow | null;
}): InvoiceRelationDivergenceDto {
  const bookingCustomerId = args.booking?.customerId ?? null;
  const diverges =
    !!args.invoiceCustomerId &&
    !!bookingCustomerId &&
    args.invoiceCustomerId !== bookingCustomerId;

  return {
    customerDiverges: diverges,
    invoiceCustomerId: args.invoiceCustomerId,
    bookingCustomerId,
    message: diverges
      ? 'Rechnungskunde und Buchungskunde weichen voneinander ab — Rechnungskunde ist führend für diese Rechnung.'
      : null,
  };
}

/** Guard: never use raw UUID as primary display text. */
export function isUuidLikeDisplay(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function assertNoUuidPrimaryDisplay(label: string): void {
  if (isUuidLikeDisplay(label)) {
    throw new Error(`Primary display must not be a UUID: ${label}`);
  }
}
