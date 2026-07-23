import { describe, expect, it } from 'vitest';

import type { BookingDetailDto, CustomerApiRecord } from '../../../lib/api';
import {
  buildInvoiceProvenance,
  buildInvoiceRelationsDto,
  customerPrimaryLabel,
  customerRef,
  WIZARD_DRAFT_MARKER,
} from './invoiceRelations.mapper';
import type { Invoice } from './invoiceTypes';

const baseInvoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  invoiceNumber: 7,
  invoiceNumberDisplay: 'FSM-2026-0007',
  type: 'OUTGOING_BOOKING',
  customerId: 'cust-11111111-2222-3333-4444-555555555555',
  vendorId: null,
  vendorName: null,
  bookingId: 'book-99999999-8888-7777-6666-555555555555',
  vehicleId: 'veh-12345678-abcd-ef01-2345-678901234567',
  title: 'Mietrechnung',
  description: '',
  lineItems: null,
  subtotalCents: 10000,
  taxCents: 1900,
  totalCents: 11900,
  paidCents: 0,
  outstandingCents: 11900,
  currency: 'EUR',
  invoiceDate: '2026-07-01',
  dueDate: '2026-07-15',
  status: 'ISSUED',
  templateId: null,
  imageUrl: null,
  extractedData: null,
  generatedDocumentId: null,
  notes: '',
  paidAt: null,
  createdAt: '2026-07-01T10:00:00Z',
  ...overrides,
});

const sampleCustomer = (): CustomerApiRecord => ({
  id: 'cust-11111111-2222-3333-4444-555555555555',
  firstName: 'Max',
  lastName: 'Mustermann',
  email: 'max@example.com',
  company: null,
  status: 'ACTIVE',
});

const sampleBooking = (): BookingDetailDto => ({
  core: {
    bookingId: 'book-99999999-8888-7777-6666-555555555555',
    bookingNumber: 'BK-555555',
    organizationId: 'org-1',
    status: 'CONFIRMED',
    statusEnum: 'CONFIRMED',
    startDate: '2026-07-10T08:00:00.000Z',
    endDate: '2026-07-12T18:00:00.000Z',
    pickupStationId: null,
    returnStationId: null,
    pickupStationName: null,
    returnStationName: null,
    notes: `${WIZARD_DRAFT_MARKER} checkout`,
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-07-01T08:00:00.000Z',
    cancelledAt: null,
    completedAt: null,
    kmIncluded: null,
    kmDriven: null,
    insuranceOptions: [],
    extras: [],
    currency: 'EUR',
    isOneWayRental: false,
    pickupAddressOverride: null,
    returnAddressOverride: null,
  },
  stations: {
    pickup: null,
    return: null,
    actualPickup: null,
    actualReturn: null,
    isOneWayRental: false,
    hasPickupDeviation: false,
    hasReturnDeviation: false,
  },
  customer: {
    customerId: 'cust-1',
    fullName: 'Max Mustermann',
    email: null,
    phone: null,
    customerStatus: null,
    identityStatus: null,
    licenseStatus: null,
    riskLevel: null,
    openInvoiceCount: 0,
    openFineCount: 0,
    noShowCount: 0,
  },
  vehicle: {
    vehicleId: 'veh-12345678-abcd-ef01-2345-678901234567',
    displayName: 'Flotte 12',
    licensePlate: 'KS-SD 100',
    vin: null,
    make: 'BMW',
    model: '320d',
    year: 2022,
    vehicleStatus: null,
    rentalBlocked: false,
    blockingReasons: [],
    odometerKm: null,
    fuelPercent: null,
    evSoc: null,
  },
  finance: {
    basePriceCents: null,
    extrasPriceCents: null,
    discountAmountCents: null,
    depositAmountCents: null,
    depositStatus: null,
    taxRate: null,
    taxAmountCents: null,
    grossAmountCents: null,
    paidAmountCents: null,
    openAmountCents: null,
    paymentStatus: null,
    invoiceStatus: null,
    finalInvoiceStatus: null,
    additionalChargesCents: null,
    refundAmountCents: null,
    retainedDepositAmountCents: null,
    computed: false,
  },
  documents: {
    bundleStatus: null,
    legalTermsAttached: false,
    legalWithdrawalAttached: false,
    legalMissing: [],
    warnings: [],
    slots: [],
  },
  handover: { pickup: null, return: null },
  tasks: { openCount: 0, overdueCount: 0, completedCount: 0, nextDueAt: null, items: [] },
  health: { rentalBlocked: false, blockingReasons: [], overallState: null, criticalWarnings: [], warningWarnings: [] },
  usage: {
    drivingStressScore: null,
    stressLevel: null,
    drivingEventsCount: null,
    abuseDetectionCount: null,
    misuseCaseCount: 0,
    hasAnalysis: false,
  },
  eligibility: null,
  rentalEligibility: null,
  activity: [],
  payments: null,
});

describe('customerRef', () => {
  it('formats KD reference from customer id suffix', () => {
    expect(customerRef('cust-11111111-2222-3333-4444-555555555555')).toBe('KD-555555');
  });
});

describe('customerPrimaryLabel', () => {
  it('prefers company name for corporate customers', () => {
    expect(
      customerPrimaryLabel({
        ...sampleCustomer(),
        company: 'Muster GmbH',
        firstName: 'Max',
        lastName: 'Mustermann',
      }),
    ).toBe('Muster GmbH');
  });

  it('falls back to person name', () => {
    expect(customerPrimaryLabel(sampleCustomer())).toBe('Max Mustermann');
  });
});

describe('buildInvoiceRelationsDto', () => {
  it('renders enriched customer, booking, and vehicle without Verknüpft or UUID', () => {
    const dto = buildInvoiceRelationsDto(
      baseInvoice(),
      {
        customer: sampleCustomer(),
        customerFetchState: 'ok',
        booking: sampleBooking(),
        bookingFetchState: 'ok',
        vehicle: {
          id: 'veh-12345678-abcd-ef01-2345-678901234567',
          make: 'BMW',
          model: '320d',
          licensePlate: 'KS-SD 100',
          vehicleName: 'Flotte 12',
        },
        vehicleFetchState: 'ok',
        createdByUserName: 'Anna Admin',
      },
      { canReadCustomers: true, canReadBookings: true, canReadFleet: true },
    );

    expect(dto.customer?.primary).toBe('Max Mustermann');
    expect(dto.customer?.secondary).toBe('KD-555555');
    expect(dto.customer?.tertiary).toBe('max@example.com');
    expect(dto.customer?.navigable).toBe(true);
    expect(dto.customer?.primary).not.toContain('Verknüpft');

    expect(dto.booking?.primary).toBe('BK-555555');
    expect(dto.booking?.tertiary).toBe('Bestätigt');
    expect(dto.booking?.secondary).toMatch(/10\.07\.2026/);
    expect(dto.booking?.navigable).toBe(true);

    expect(dto.vehicle?.primary).toBe('BMW 320d');
    expect(dto.vehicle?.secondary).toBe('KS-SD 100');
    expect(dto.vehicle?.primary).not.toContain('veh-');
    expect(dto.vehicle?.navigable).toBe(true);
  });

  it('marks archived customer as non-navigable fallback', () => {
    const dto = buildInvoiceRelationsDto(baseInvoice(), {
      customer: { ...sampleCustomer(), archivedAt: '2026-01-01T00:00:00Z' },
      customerFetchState: 'ok',
    });
    expect(dto.customer?.fallback).toBe('archived');
    expect(dto.customer?.primary).toBe('Relation archiviert');
    expect(dto.customer?.navigable).toBe(false);
  });

  it('handles deleted customer relation', () => {
    const dto = buildInvoiceRelationsDto(baseInvoice(), {
      customerFetchState: 'not_found',
    });
    expect(dto.customer?.fallback).toBe('deleted');
    expect(dto.customer?.primary).toBe('Relation gelöscht');
    expect(dto.customer?.navigable).toBe(false);
  });

  it('handles unavailable booking data with public booking number', () => {
    const dto = buildInvoiceRelationsDto(baseInvoice(), {
      bookingFetchState: 'error',
    });
    expect(dto.booking?.primary).toBe('BK-555555');
    expect(dto.booking?.secondary).toBe('Daten nicht verfügbar');
    expect(dto.booking?.fallback).toBe('unavailable');
  });

  it('uses booking vehicle when fleet lookup is missing', () => {
    const dto = buildInvoiceRelationsDto(baseInvoice(), {
      booking: sampleBooking(),
      bookingFetchState: 'ok',
      vehicleFetchState: 'not_found',
    });
    expect(dto.vehicle?.primary).toBe('BMW 320d');
    expect(dto.vehicle?.fallback).toBeNull();
  });

  it('blocks navigation without permissions', () => {
    const dto = buildInvoiceRelationsDto(
      baseInvoice(),
      {
        customer: sampleCustomer(),
        customerFetchState: 'ok',
        booking: sampleBooking(),
        bookingFetchState: 'ok',
        vehicle: { id: 'veh-1', make: 'VW', model: 'Golf', licensePlate: 'B-AB 123' },
        vehicleFetchState: 'ok',
      },
      { canReadCustomers: false, canReadBookings: false, canReadFleet: false },
    );
    expect(dto.customer?.navigable).toBe(false);
    expect(dto.booking?.navigable).toBe(false);
    expect(dto.vehicle?.navigable).toBe(false);
    expect(dto.customer?.navigationBlockedReason).toContain('Kundendetails');
  });
});

describe('buildInvoiceProvenance', () => {
  it('maps wizard booking invoice with user attribution', () => {
    const provenance = buildInvoiceProvenance(baseInvoice(), {
      createdByUserName: 'Anna Admin',
      booking: sampleBooking(),
      bookingFetchState: 'ok',
    });
    expect(provenance.erstelltVon).toBe('Anna Admin');
    expect(provenance.erstelltUeber).toBe('Buchungsassistent');
    expect(provenance.quelle).toBe('Buchung BK-555555');
    expect(provenance.erstelltUeber).not.toBe('Automatisch (Buchung)');
  });

  it('maps automatic booking confirmation without user', () => {
    const provenance = buildInvoiceProvenance(baseInvoice(), {
      booking: { ...sampleBooking(), core: { ...sampleBooking().core, notes: null } },
    });
    expect(provenance.erstelltVon).toBe('System');
    expect(provenance.erstelltUeber).toBe('Buchungsbestätigung');
  });

  it('maps document extraction incoming invoices', () => {
    const provenance = buildInvoiceProvenance(
      baseInvoice({ type: 'INCOMING_UPLOADED', documentExtractionId: 'ext-1', bookingId: null, customerId: null, vehicleId: null }),
      {},
    );
    expect(provenance.erstelltUeber).toBe('KI-Upload');
    expect(provenance.quelle).toBe('Dokumentenextraktion');
  });

  it('maps legacy provenance', () => {
    const provenance = buildInvoiceProvenance(
      baseInvoice({ type: 'UNKNOWN_LEGACY' as Invoice['type'], bookingId: null }),
      {},
    );
    expect(provenance.isLegacy).toBe(true);
    expect(provenance.erstelltUeber).toBe('Legacy-Herkunft');
  });
});
