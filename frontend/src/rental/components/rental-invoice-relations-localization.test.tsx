// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@iconify/react', () => ({
  Icon: () => null,
  disableCache: vi.fn(),
}));

import { act, createElement, useMemo, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LanguageProvider, useLanguage } from '../../i18n/LanguageContext';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import inventory from '../../i18n/hardcoded-copy-inventory.json';
import { buildInvoiceRelationsDto } from './invoices/invoiceRelations.mapper';
import { InvoiceRelations } from './invoices/InvoiceRelations';
import type { Invoice } from './invoices/invoiceTypes';
import {
  rentalInvoiceRelationsEntityLabel,
  rentalInvoiceRelationsFallbackLabel,
  rentalInvoiceRelationsSectionTitle,
  rir,
} from '../lib/rental-invoice-relations-i18n';

const P251_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceRelations.tsx',
  'rental/components/invoices/InvoiceRelationRow.tsx',
  'rental/components/invoices/invoiceRelations.mapper.ts',
  'rental/lib/rental-invoice-relations-i18n.ts',
];

const CUSTOMER_NAME = 'Max Mustermann X7';
const COMPANY_NAME = 'Muster Mobility GmbH X7';
const BOOKING_NUMBER = 'BK-2026-X7';
const PLATE = 'KS-FS-1234';
const VENDOR_NAME = 'Lieferant Sondername X7';
const CUSTOM_TEMPLATE = 'Sondervorlage X7';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

function isP251EnforceCleanPath(relPath: string): boolean {
  return P251_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function p251ScopedFindings() {
  return inventory.findings.filter((finding) => isP251EnforceCleanPath(finding.file));
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-p251',
    invoiceNumber: 1,
    invoiceNumberDisplay: 'FSM-2026-0001',
    type: 'OUTGOING_BOOKING',
    customerId: 'cust-11111111-2222-3333-4444-555555555555',
    vendorId: 'vendor-x7-id',
    vendorName: VENDOR_NAME,
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
    templateId: CUSTOM_TEMPLATE,
    imageUrl: null,
    extractedData: null,
    generatedDocumentId: null,
    notes: '',
    paidAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

function SameMountRelationsApp({
  invoice,
  enrichment,
  permissions,
  navigation,
}: {
  invoice: Invoice;
  enrichment: NonNullable<Parameters<typeof buildInvoiceRelationsDto>[1]>;
  permissions: NonNullable<Parameters<typeof buildInvoiceRelationsDto>[2]>;
  navigation: Parameters<typeof InvoiceRelations>[0]['navigation'];
}) {
  const { locale, setLocale } = useLanguage();
  const detail = useMemo(
    () =>
      ({
        relations: buildInvoiceRelationsDto(invoice, enrichment, permissions, locale),
      }) as Parameters<typeof InvoiceRelations>[0]['detail'],
    [invoice, enrichment, permissions, locale],
  );

  return createElement(
    'div',
    null,
    createElement('button', {
      type: 'button',
      'data-testid': 'locale-de',
      onClick: () => setLocale('de'),
    }, 'DE'),
    createElement('button', {
      type: 'button',
      'data-testid': 'locale-en',
      onClick: () => setLocale('en'),
    }, 'EN'),
    createElement(InvoiceRelations, {
      detail,
      navigation,
      ...theme,
    }),
  );
}

describe('P2.2.51 rental invoice relations localization', () => {
  it('has zero P251 enforce-clean scanner debt', () => {
    expect(p251ScopedFindings()).toHaveLength(0);
  });

  it('registers 13 bounded EN+DE relation keys', () => {
    const keys = Object.keys(en).filter((key) => key.startsWith('rental.invoice.relations.'));
    expect(keys).toHaveLength(13);
    for (const key of keys) {
      expect(de[key as keyof typeof de]).toBeTruthy();
      expect(en[key as keyof typeof en]).toBeTruthy();
    }
  });

  it('localizes section chrome in EN without translating entity raw values', () => {
    const relations = buildInvoiceRelationsDto(
      sampleInvoice(),
      {
        customer: {
          id: 'cust-11111111-2222-3333-4444-555555555555',
          firstName: 'Max',
          lastName: 'Mustermann X7',
          email: 'max@example.com',
        },
        customerFetchState: 'ok',
        booking: {
          core: {
            bookingId: 'book-99999999-8888-7777-6666-555555555555',
            bookingNumber: BOOKING_NUMBER,
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
            fullName: CUSTOMER_NAME,
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
            displayName: 'VW Golf',
            licensePlate: PLATE,
            vin: 'WVWZZZTESTX7',
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
          health: {
            rentalBlocked: false,
            blockingReasons: [],
            overallState: null,
            criticalWarnings: [],
            warningWarnings: [],
          },
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
        },
        bookingFetchState: 'ok',
        vehicleFetchState: 'ok',
      },
      {
        canReadCustomers: true,
        canReadBookings: true,
        canReadFleet: true,
      },
      'en',
    );

    expect(rentalInvoiceRelationsSectionTitle('en')).toBe('Assignment');
    expect(relations.customer?.primary).toBe(CUSTOMER_NAME);
    expect(relations.booking?.primary).toBe(BOOKING_NUMBER);
    expect(relations.vehicle?.secondary).toBe(PLATE);
    expect(relations.vendor?.primary).toBe(VENDOR_NAME);
    expect(relations.template?.name).toBe(CUSTOM_TEMPLATE);
    expect(relations.customer?.label).toBe(rentalInvoiceRelationsEntityLabel('en', 'customer'));
    expect(relations.booking?.tertiary).toBe(en['bookings.confirmed']);
  });

  it('preserves company customer raw value and localizes archived fallback', () => {
    const relations = buildInvoiceRelationsDto(
      sampleInvoice(),
      {
        customer: {
          id: 'cust-1',
          company: COMPANY_NAME,
          firstName: 'Hidden',
          lastName: 'Person',
          status: 'ARCHIVED',
          archivedAt: '2026-01-01T00:00:00.000Z',
        },
        customerFetchState: 'ok',
      },
      undefined,
      'en',
    );

    expect(relations.customer?.primary).toBe(rentalInvoiceRelationsFallbackLabel('en', 'archived'));
    expect(relations.customer?.navigable).toBe(false);
  });

  it('preserves same-mount locale switch with raw entities and navigation callbacks', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    const onOpenCustomer = vi.fn();
    const onOpenBooking = vi.fn();
    const onOpenVehicle = vi.fn();
    const invoice = sampleInvoice({ templateId: 'standard' });
    const enrichment = {
        customer: {
          id: 'cust-11111111-2222-3333-4444-555555555555',
          firstName: 'Max',
          lastName: 'Mustermann X7',
          email: 'max@example.com',
        },
        customerFetchState: 'ok',
        booking: {
          core: {
            bookingId: 'book-99999999-8888-7777-6666-555555555555',
            bookingNumber: BOOKING_NUMBER,
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
            fullName: CUSTOMER_NAME,
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
            displayName: 'VW Golf',
            licensePlate: PLATE,
            vin: 'WVWZZZTESTX7',
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
          health: {
            rentalBlocked: false,
            blockingReasons: [],
            overallState: null,
            criticalWarnings: [],
            warningWarnings: [],
          },
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
        },
        bookingFetchState: 'ok',
        vehicleFetchState: 'ok' as const,
      };
    const permissions = {
      canReadCustomers: false,
      canReadBookings: true,
      canReadFleet: true,
    };

    await act(async () => {
      root.render(
        createElement(
          LanguageProvider,
          null,
          createElement(SameMountRelationsApp, {
            invoice,
            enrichment,
            permissions,
            navigation: { onOpenCustomer, onOpenBooking, onOpenVehicle },
          }),
        ),
      );
    });

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const sectionDe = container.querySelector('[data-testid="invoice-relations-primary"]');
    expect(sectionDe?.textContent).toContain('Zuordnung');
    expect(sectionDe?.textContent).toContain(CUSTOMER_NAME);
    expect(sectionDe?.textContent).toContain(BOOKING_NUMBER);
    expect(sectionDe?.textContent).toContain(PLATE);
    expect(sectionDe?.textContent).toContain(VENDOR_NAME);
    expect(sectionDe?.textContent).toContain('Keine Berechtigung für Kundendetails');
    expect(container.querySelectorAll('button').length).toBeGreaterThan(0);

    await act(async () => {
      container.querySelector('[data-testid="locale-en"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    const sectionEn = container.querySelector('[data-testid="invoice-relations-primary"]');
    expect(sectionEn?.textContent).toContain('Assignment');
    expect(sectionEn?.textContent).toContain(CUSTOMER_NAME);
    expect(sectionEn?.textContent).toContain(BOOKING_NUMBER);
    expect(sectionEn?.textContent).toContain(PLATE);
    expect(sectionEn?.textContent).toContain(VENDOR_NAME);
    expect(sectionEn?.textContent).toContain('No permission to view customer details');
    expect(sectionEn?.textContent).toContain(en['invoices.create.template.standard.name']);

    const bookingButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label')?.includes(BOOKING_NUMBER),
    );
    expect(bookingButton).toBeTruthy();
    await act(async () => {
      bookingButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onOpenBooking).toHaveBeenCalledWith('book-99999999-8888-7777-6666-555555555555');

    await act(async () => {
      container.querySelector('[data-testid="locale-de"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });

    expect(container.querySelector('[data-testid="invoice-relations-primary"]')?.textContent).toContain(
      'Zuordnung',
    );
    expect(container.querySelector('[data-testid="invoice-relations-primary"]')?.textContent).toContain(
      CUSTOMER_NAME,
    );

    root.unmount();
    container.remove();
  });

  it('does not expose raw translation keys in rendered relations chrome', () => {
    expect(rir('en', 'rental.invoice.relations.section.title')).toBe('Assignment');
    expect(rir('de', 'rental.invoice.relations.section.title')).toBe('Zuordnung');
    expect(rir('en', 'rental.invoice.relations.section.title')).not.toContain(
      'rental.invoice.relations.',
    );
  });
});
