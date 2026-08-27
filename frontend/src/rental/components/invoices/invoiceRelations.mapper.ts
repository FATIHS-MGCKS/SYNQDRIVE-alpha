import type { BookingDetailDto, CustomerApiRecord } from '../../../lib/api';
import { customerDisplayName } from '../../../operator/bookings/operatorBooking.utils';
import { bookingRef } from '../bookings/bookingUtils';
import { bookingStatusLabel, normalizeBookingStatus } from '../bookings/bookingStatus';
import {
  formatRentalInvoiceRelationsPeriod,
  rentalInvoiceRelationsEntityLabel,
  rentalInvoiceRelationsFallbackLabel,
  rentalInvoiceRelationsPermissionBlockedReason,
  rentalInvoiceRelationsTemplateDisplayName,
} from '../../lib/rental-invoice-relations-i18n';
import type {
  InvoiceEntityRelation,
  InvoiceProvenanceDto,
  InvoiceRelationsDto,
  InvoiceRelationFallback,
} from './invoiceDetailTypes';
import type { Invoice } from './invoiceTypes';
import type { InvoiceLookupVehicle } from './hooks/useInvoices';

export const WIZARD_DRAFT_MARKER = '[synq:wizard-draft]';

export type InvoiceRelationsPermissions = {
  canReadCustomers: boolean;
  canReadBookings: boolean;
  canReadFleet: boolean;
};

export type InvoiceRelationsEnrichment = {
  customer?: CustomerApiRecord | null;
  customerFetchState?: 'ok' | 'not_found' | 'error';
  booking?: BookingDetailDto | null;
  bookingFetchState?: 'ok' | 'not_found' | 'error';
  vehicle?: InvoiceLookupVehicle | null;
  vehicleFetchState?: 'ok' | 'not_found' | 'error';
  createdByUserName?: string | null;
};

export function customerRef(id: string): string {
  return `KD-${String(id).slice(-6).toUpperCase()}`;
}

export function customerPrimaryLabel(customer: CustomerApiRecord): string {
  const company = (customer.company ?? customer.companyName)?.trim();
  if (company) return company;
  return customerDisplayName(customer);
}

function fallbackLabel(fallback: InvoiceRelationFallback): string {
  switch (fallback) {
    case 'archived':
      return 'Relation archiviert';
    case 'deleted':
      return 'Relation gelöscht';
    case 'unavailable':
      return 'Daten nicht verfügbar';
    case 'legacy':
      return 'Legacy-Herkunft';
    default:
      return 'Daten nicht verfügbar';
  }
}

function buildCustomerRelation(
  invoice: Invoice,
  enrichment: InvoiceRelationsEnrichment,
  permissions: InvoiceRelationsPermissions,
  locale: string,
): InvoiceEntityRelation | null {
  if (!invoice.customerId) return null;

  const canNavigate = permissions.canReadCustomers;
  const blocked = rentalInvoiceRelationsPermissionBlockedReason(locale, 'customer', canNavigate);

  if (enrichment.customerFetchState === 'not_found') {
    return {
      kind: 'customer',
      label: rentalInvoiceRelationsEntityLabel(locale, 'customer'),
      primary: rentalInvoiceRelationsFallbackLabel(locale, 'deleted'),
      secondary: customerRef(invoice.customerId),
      tertiary: null,
      fallback: 'deleted',
      entityId: invoice.customerId,
      navigable: false,
      navigationBlockedReason: blocked,
    };
  }

  if (enrichment.customerFetchState === 'error' || !enrichment.customer) {
    return {
      kind: 'customer',
      label: rentalInvoiceRelationsEntityLabel(locale, 'customer'),
      primary: rentalInvoiceRelationsFallbackLabel(locale, 'unavailable'),
      secondary: customerRef(invoice.customerId),
      tertiary: null,
      fallback: 'unavailable',
      entityId: invoice.customerId,
      navigable: false,
      navigationBlockedReason: blocked,
    };
  }

  const customer = enrichment.customer;
  const archived = Boolean(customer.archivedAt) || customer.status === 'ARCHIVED';

  return {
    kind: 'customer',
    label: rentalInvoiceRelationsEntityLabel(locale, 'customer'),
    primary: archived
      ? rentalInvoiceRelationsFallbackLabel(locale, 'archived')
      : customerPrimaryLabel(customer),
    secondary: customerRef(customer.id),
    tertiary: customer.email?.trim() || null,
    fallback: archived ? 'archived' : null,
    entityId: customer.id,
    navigable: canNavigate && !archived,
    navigationBlockedReason: blocked,
  };
}

function buildBookingRelation(
  invoice: Invoice,
  enrichment: InvoiceRelationsEnrichment,
  permissions: InvoiceRelationsPermissions,
  locale: string,
): InvoiceEntityRelation | null {
  if (!invoice.bookingId) return null;

  const canNavigate = permissions.canReadBookings;
  const blocked = rentalInvoiceRelationsPermissionBlockedReason(locale, 'booking', canNavigate);
  const publicNumber = bookingRef(invoice.bookingId);

  if (enrichment.bookingFetchState === 'not_found') {
    return {
      kind: 'booking',
      label: rentalInvoiceRelationsEntityLabel(locale, 'booking'),
      primary: publicNumber,
      secondary: rentalInvoiceRelationsFallbackLabel(locale, 'deleted'),
      tertiary: null,
      fallback: 'deleted',
      entityId: invoice.bookingId,
      navigable: false,
      navigationBlockedReason: blocked,
    };
  }

  if (enrichment.bookingFetchState === 'error' || !enrichment.booking) {
    return {
      kind: 'booking',
      label: rentalInvoiceRelationsEntityLabel(locale, 'booking'),
      primary: publicNumber,
      secondary: rentalInvoiceRelationsFallbackLabel(locale, 'unavailable'),
      tertiary: null,
      fallback: 'unavailable',
      entityId: invoice.bookingId,
      navigable: false,
      navigationBlockedReason: blocked,
    };
  }

  const booking = enrichment.booking;
  const status = normalizeBookingStatus(booking.core.statusEnum, booking.core.status);
  const period = formatRentalInvoiceRelationsPeriod(
    locale,
    booking.core.startDate,
    booking.core.endDate,
  );

  return {
    kind: 'booking',
    label: rentalInvoiceRelationsEntityLabel(locale, 'booking'),
    primary: booking.core.bookingNumber || publicNumber,
    secondary: period,
    tertiary: bookingStatusLabel(status, locale),
    fallback: null,
    entityId: booking.core.bookingId,
    navigable: canNavigate,
    navigationBlockedReason: blocked,
  };
}

function resolveVehicleFields(
  invoice: Invoice,
  enrichment: InvoiceRelationsEnrichment,
): {
  make: string | null;
  model: string | null;
  licensePlate: string | null;
  fleetName: string | null;
} {
  const fromBooking = enrichment.booking?.vehicle;
  const fromLookup = enrichment.vehicle;
  const make = fromBooking?.make ?? fromLookup?.make ?? null;
  const model = fromBooking?.model ?? fromLookup?.model ?? null;
  const licensePlate =
    fromBooking?.licensePlate ??
    fromLookup?.licensePlate ??
    fromLookup?.license ??
    null;
  const fleetName =
    (fromBooking?.displayName &&
    fromBooking.displayName !== [make, model].filter(Boolean).join(' ').trim()
      ? fromBooking.displayName
      : null) ??
    (typeof fromLookup?.vehicleName === 'string' ? fromLookup.vehicleName : null);

  return { make, model, licensePlate, fleetName };
}

function buildVehicleRelation(
  invoice: Invoice,
  enrichment: InvoiceRelationsEnrichment,
  permissions: InvoiceRelationsPermissions,
  locale: string,
): InvoiceEntityRelation | null {
  if (!invoice.vehicleId) return null;

  const canNavigate = permissions.canReadFleet;
  const blocked = rentalInvoiceRelationsPermissionBlockedReason(locale, 'vehicle', canNavigate);
  const { make, model, licensePlate, fleetName } = resolveVehicleFields(invoice, enrichment);
  const hasVehicleData = Boolean(make || model || licensePlate || fleetName);
  const bookingHasVehicle =
    enrichment.booking?.vehicle?.vehicleId === invoice.vehicleId &&
    Boolean(
      enrichment.booking.vehicle.make ||
        enrichment.booking.vehicle.model ||
        enrichment.booking.vehicle.licensePlate ||
        enrichment.booking.vehicle.displayName,
    );

  if (enrichment.vehicleFetchState === 'not_found' && !hasVehicleData && !bookingHasVehicle) {
    return {
      kind: 'vehicle',
      label: rentalInvoiceRelationsEntityLabel(locale, 'vehicle'),
      primary: rentalInvoiceRelationsFallbackLabel(locale, 'deleted'),
      secondary: null,
      tertiary: null,
      fallback: 'deleted',
      entityId: invoice.vehicleId,
      navigable: false,
      navigationBlockedReason: blocked,
    };
  }

  if (!hasVehicleData && enrichment.vehicleFetchState === 'error') {
    return {
      kind: 'vehicle',
      label: rentalInvoiceRelationsEntityLabel(locale, 'vehicle'),
      primary: rentalInvoiceRelationsFallbackLabel(locale, 'unavailable'),
      secondary: null,
      tertiary: null,
      fallback: 'unavailable',
      entityId: invoice.vehicleId,
      navigable: false,
      navigationBlockedReason: blocked,
    };
  }

  const primary =
    [make, model].filter(Boolean).join(' ').trim() ||
    fleetName ||
    rentalInvoiceRelationsFallbackLabel(locale, 'unavailable');

  return {
    kind: 'vehicle',
    label: rentalInvoiceRelationsEntityLabel(locale, 'vehicle'),
    primary,
    secondary: licensePlate,
    tertiary: fleetName,
    fallback: hasVehicleData ? null : 'unavailable',
    entityId: invoice.vehicleId,
    navigable: canNavigate && hasVehicleData,
    navigationBlockedReason: blocked,
  };
}

function buildVendorRelation(invoice: Invoice, locale: string): InvoiceEntityRelation | null {
  if (!invoice.vendorName && !invoice.vendorId) return null;

  return {
    kind: 'vendor',
    label: rentalInvoiceRelationsEntityLabel(locale, 'vendor'),
    primary: invoice.vendorName?.trim() || rentalInvoiceRelationsFallbackLabel(locale, 'unavailable'),
    secondary: null,
    tertiary: null,
    fallback: invoice.vendorName ? null : 'unavailable',
    entityId: invoice.vendorId,
    navigable: false,
    navigationBlockedReason: null,
  };
}

export function buildInvoiceProvenance(
  invoice: Invoice,
  enrichment: InvoiceRelationsEnrichment,
): InvoiceProvenanceDto {
  const bookingNumber = invoice.bookingId ? bookingRef(invoice.bookingId) : null;
  const userTriggered = Boolean(enrichment.createdByUserName?.trim());
  const wizardBooking =
    enrichment.booking?.core.notes?.includes(WIZARD_DRAFT_MARKER) ?? false;

  let erstelltVon = enrichment.createdByUserName?.trim() || '';
  let erstelltUeber = '';
  let quelle = '';
  let isLegacy = false;

  if (invoice.documentExtractionId || invoice.type === 'INCOMING_UPLOADED') {
    erstelltUeber = 'KI-Upload';
    quelle = 'Dokumentenextraktion';
  } else if (invoice.type === 'OUTGOING_BOOKING' && invoice.bookingId) {
    erstelltUeber = userTriggered || wizardBooking ? 'Buchungsassistent' : 'Buchungsbestätigung';
    quelle = bookingNumber ? `Buchung ${bookingNumber}` : 'Buchung';
  } else if (invoice.type === 'OUTGOING_MANUAL' || invoice.type === 'OUTGOING_FINAL') {
    erstelltUeber = 'Rechnungsstellung';
    quelle = userTriggered ? 'Manuell erstellt' : 'Automatisch';
  } else if (invoice.type === 'INCOMING_VENDOR') {
    erstelltUeber = 'Lieferantenverwaltung';
    quelle = invoice.vendorName?.trim() || 'Lieferant';
  } else {
    isLegacy = true;
    erstelltUeber = 'Legacy-Herkunft';
    quelle = fallbackLabel('legacy');
  }

  if (!erstelltVon) {
    erstelltVon = userTriggered ? erstelltVon : isLegacy ? 'Unbekannt' : 'System';
  }

  if (!erstelltUeber) {
    erstelltUeber = isLegacy ? fallbackLabel('legacy') : 'Unbekannt';
  }

  if (!quelle) {
    quelle = isLegacy ? fallbackLabel('legacy') : '—';
  }

  return { erstelltVon, erstelltUeber, quelle, isLegacy };
}

export function buildInvoiceRelationsDto(
  invoice: Invoice,
  enrichment: InvoiceRelationsEnrichment = {},
  permissions: InvoiceRelationsPermissions = {
    canReadCustomers: true,
    canReadBookings: true,
    canReadFleet: true,
  },
  locale = 'de',
): InvoiceRelationsDto {
  const template = invoice.templateId
    ? {
        id: invoice.templateId,
        name: rentalInvoiceRelationsTemplateDisplayName(locale, invoice.templateId),
      }
    : null;

  return {
    customer: buildCustomerRelation(invoice, enrichment, permissions, locale),
    booking: buildBookingRelation(invoice, enrichment, permissions, locale),
    vehicle: buildVehicleRelation(invoice, enrichment, permissions, locale),
    vendor: buildVendorRelation(invoice, locale),
    provenance: buildInvoiceProvenance(invoice, enrichment),
    template,
  };
}
