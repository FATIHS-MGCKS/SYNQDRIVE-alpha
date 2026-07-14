import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildInvoiceDetailDto } from './invoiceDetail.mapper';
import { InvoiceRelations } from './InvoiceRelations';
import type { Invoice } from './invoiceTypes';

const sampleInvoice = (): Invoice => ({
  id: 'inv-1',
  invoiceNumber: 1,
  invoiceNumberDisplay: 'FSM-2026-0001',
  type: 'OUTGOING_BOOKING',
  customerId: 'cust-11111111-2222-3333-4444-555555555555',
  vendorId: null,
  vendorName: null,
  bookingId: 'book-99999999-8888-7777-6666-555555555555',
  vehicleId: 'veh-1',
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
});

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

describe('InvoiceRelations component', () => {
  it('renders provenance fields separately and never shows Verknüpft', () => {
    const detail = buildInvoiceDetailDto(sampleInvoice(), {
      canManageEmail: true,
      relationsEnrichment: {
        customer: {
          id: 'cust-11111111-2222-3333-4444-555555555555',
          firstName: 'Erika',
          lastName: 'Beispiel',
          email: 'erika@example.com',
        },
        customerFetchState: 'ok',
        bookingFetchState: 'error',
        vehicleFetchState: 'error',
        createdByUserName: 'Tom Tenant',
      },
    });

    const html = renderToStaticMarkup(
      <InvoiceRelations detail={detail} {...theme} />,
    );

    expect(html).toContain('Erika Beispiel');
    expect(html).toContain('KD-555555');
    expect(html).toContain('Erstellt von');
    expect(html).toContain('Erstellt über');
    expect(html).toContain('Quelle');
    expect(html).toContain('Tom Tenant');
    expect(html).toContain('Buchungsassistent');
    expect(html).not.toContain('Verknüpft');
    expect(html).not.toContain('cust-11111111');
    expect(html).not.toContain('Automatisch (Buchung)');
  });

  it('renders clickable booking row when navigable', () => {
    const detail = buildInvoiceDetailDto(sampleInvoice(), {
      canManageEmail: true,
      relationsEnrichment: {
        booking: {
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
            notes: null,
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
            fullName: 'Max',
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
            vehicleId: 'veh-1',
            displayName: 'VW Golf',
            licensePlate: 'B-AB 123',
            vin: null,
            make: 'VW',
            model: 'Golf',
            year: 2020,
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
          activity: [],
          payments: null,
        },
        bookingFetchState: 'ok',
      },
    });

    const onOpenBooking = vi.fn();
    const html = renderToStaticMarkup(
      <InvoiceRelations
        detail={detail}
        navigation={{ onOpenBooking }}
        {...theme}
      />,
    );

    expect(html).toContain('BK-555555');
    expect(html).toContain('<button');
    expect(html).toContain('Bestätigt');
  });

  it('shows permission hint and no button when navigation is blocked', () => {
    const detail = buildInvoiceDetailDto(sampleInvoice(), {
      canManageEmail: true,
      relationsEnrichment: {
        customer: { id: 'cust-1', firstName: 'No', lastName: 'Access' },
        customerFetchState: 'ok',
      },
      relationsPermissions: {
        canReadCustomers: false,
        canReadBookings: true,
        canReadFleet: true,
      },
    });

    const html = renderToStaticMarkup(
      <InvoiceRelations detail={detail} navigation={{ onOpenCustomer: vi.fn() }} {...theme} />,
    );

    expect(html).toContain('Keine Berechtigung für Kundendetails');
    expect(html).not.toContain('aria-label="Kunde: No Access"');
  });

  it('renders deleted customer and legacy provenance', () => {
    const invoice: Invoice = {
      ...sampleInvoice(),
      type: 'UNKNOWN_LEGACY',
      bookingId: null,
      vehicleId: null,
      customerId: 'cust-deleted-id-123456',
    };

    const detail = buildInvoiceDetailDto(invoice, {
      canManageEmail: true,
      relationsEnrichment: {
        customerFetchState: 'not_found',
      },
    });

    const html = renderToStaticMarkup(<InvoiceRelations detail={detail} {...theme} />);
    expect(html).toContain('Relation gelöscht');
    expect(html).toContain('Legacy-Herkunft');
    expect(html).not.toContain('BK-');
  });
});
