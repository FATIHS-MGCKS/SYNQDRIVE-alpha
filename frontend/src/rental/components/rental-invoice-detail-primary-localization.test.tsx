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
import { buildInvoiceDetailDto } from './invoices/invoiceDetail.mapper';
import { InvoiceDetailHeader } from './invoices/InvoiceDetailHeader';
import { InvoiceHeaderMoreMenu } from './invoices/InvoiceHeaderMoreMenu';
import { InvoiceRelations } from './invoices/InvoiceRelations';
import { invoiceStatusTone } from './invoices/invoiceDetailStatus.util';
import type { Invoice } from './invoices/invoiceTypes';
import type { CustomerApiRecord, BookingDetailDto } from '../../lib/api';

const P250_ENFORCE_CLEAN_EXACT = [
  'rental/components/invoices/InvoiceDetailHeader.tsx',
  'rental/components/invoices/InvoiceHeaderMoreMenu.tsx',
  'rental/components/invoices/InvoiceRelations.tsx',
  'rental/components/invoices/invoiceDetail.mapper.ts',
  'rental/components/invoices/invoiceRelations.mapper.ts',
  'rental/components/invoices/invoiceUtils.ts',
  'rental/lib/rental-invoice-detail-primary-i18n.ts',
];

const INVOICE_NUMBER = 'RE-2026-00421';
const CUSTOMER_NAME = 'Max Mustermann X7';
const BOOKING_NUMBER = 'BK-2026-X7';
const VEHICLE_PLATE = 'KS-FS-1234';

const theme = {
  card: 'card',
  tp: 'text-foreground',
  ts: 'text-muted-foreground',
  inputCls: 'input',
  isDarkMode: false,
};

function isP250EnforceCleanPath(relPath: string): boolean {
  return P250_ENFORCE_CLEAN_EXACT.includes(relPath);
}

function sampleInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-primary-x7',
    invoiceNumber: 421,
    invoiceNumberDisplay: INVOICE_NUMBER,
    type: 'OUTGOING_BOOKING',
    customerId: 'cust-x7',
    vendorId: null,
    vendorName: null,
    bookingId: 'book-x7',
    vehicleId: 'veh-x7',
    title: 'Mietrechnung',
    description: '',
    lineItems: null,
    subtotalCents: 10000,
    taxCents: 1900,
    totalCents: 11900,
    paidCents: 5000,
    outstandingCents: 6900,
    currency: 'EUR',
    invoiceDate: '2026-07-01',
    dueDate: '2026-07-15',
    status: 'PARTIALLY_PAID',
    templateId: 'booking',
    imageUrl: null,
    extractedData: null,
    generatedDocumentId: 'doc-x7',
    notes: '',
    paidAt: null,
    createdAt: '2026-07-01T10:00:00Z',
    ...overrides,
  };
}

const sampleCustomer = (): CustomerApiRecord => ({
  id: 'cust-x7',
  firstName: 'Max',
  lastName: 'Mustermann X7',
  email: 'max.x7@example.com',
  phone: null,
  company: null,
  companyName: null,
  status: 'ACTIVE',
  archivedAt: null,
});

const sampleBooking = (): BookingDetailDto => ({
  core: {
    bookingId: 'book-x7',
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
    notes: '',
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
    customerId: 'cust-x7',
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
    vehicleId: 'veh-x7',
    displayName: 'VW Golf',
    licensePlate: VEHICLE_PLATE,
    vin: null,
    make: 'VW',
    model: 'Golf',
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

function buildDetail(locale: string, invoice = sampleInvoice()) {
  return buildInvoiceDetailDto(invoice, {
    locale,
    canManageEmail: true,
    canManageFinance: true,
    relationsEnrichment: {
      customer: sampleCustomer(),
      customerFetchState: 'ok',
      booking: sampleBooking(),
      bookingFetchState: 'ok',
      vehicle: {
        id: 'veh-x7',
        make: 'VW',
        model: 'Golf',
        licensePlate: VEHICLE_PLATE,
        license: VEHICLE_PLATE,
        vehicleName: 'VW Golf',
      },
      vehicleFetchState: 'ok',
    },
    relationsPermissions: {
      canReadCustomers: true,
      canReadBookings: true,
      canReadFleet: true,
    },
  });
}

function renderWithLocale(locale: 'de' | 'en', ui: ReactNode) {
  const mountContainer = document.createElement('div');
  document.body.appendChild(mountContainer);
  const mountRoot: Root = createRoot(mountContainer);
  window.localStorage.setItem('synqdrive.locale', locale);
  act(() => {
    mountRoot.render(createElement(LanguageProvider, null, ui));
  });
  return { container: mountContainer, root: mountRoot };
}

function HeaderHarness({ invoice = sampleInvoice() }: { invoice?: Invoice }) {
  const { locale } = useLanguage();
  const detail = useMemo(() => buildDetail(locale, invoice), [locale, invoice]);
  return createElement(InvoiceDetailHeader, { detail, ...theme });
}

function LocaleSwitchHarness({ children }: { children: ReactNode }) {
  const { locale, setLocale } = useLanguage();
  return createElement(
    'div',
    null,
    createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'toggle-locale',
        onClick: () => setLocale(locale === 'de' ? 'en' : 'de'),
      },
      'toggle-locale',
    ),
    children,
  );
}

describe('P250 rental invoice detail primary localization', () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    if (root && container) {
      act(() => root!.unmount());
      container.remove();
      root = null;
      container = null;
    }
  });

  it('keeps P250 enforce-clean scope at zero inventory findings', () => {
    const debt = inventory.findings.filter((f) => isP250EnforceCleanPath(f.file));
    expect(debt).toHaveLength(0);
  });

  it('renders EN header chrome and preserves raw invoice number', () => {
    const { container: view } = renderWithLocale('en', createElement(HeaderHarness));
    const text = view.textContent ?? '';
    expect(text).toContain(INVOICE_NUMBER);
    expect(text).toContain(en['rental.invoice.detail.primary.amount.paid']);
    expect(text).toContain(en['invoices.list.status.PARTIALLY_PAID']);
    expect(text).not.toContain('Bezahlt');
  });

  it('renders DE header chrome on same fixture', () => {
    const { container: view } = renderWithLocale('de', createElement(HeaderHarness));
    const text = view.textContent ?? '';
    expect(text).toContain(INVOICE_NUMBER);
    expect(text).toContain(de['rental.invoice.detail.primary.amount.paid']);
    expect(text).toContain(de['invoices.list.status.PARTIALLY_PAID']);
  });

  it('preserves raw cents and currency across locales', () => {
    const enDetail = buildDetail('en');
    const deDetail = buildDetail('de');
    expect(enDetail.amounts.totalCents).toBe(11900);
    expect(deDetail.amounts.totalCents).toBe(11900);
    expect(enDetail.amounts.paidCents).toBe(5000);
    expect(deDetail.amounts.outstandingCents).toBe(6900);
    expect(enDetail.core.currency).toBe('EUR');
    expect(deDetail.core.currency).toBe('EUR');
  });

  it('preserves outstanding formula when outstandingCents omitted', () => {
    const invoice = sampleInvoice({ outstandingCents: undefined, paidCents: 3000, totalCents: 11900 });
    const dto = buildDetail('en', invoice);
    expect(dto.amounts.outstandingCents).toBe(8900);
  });

  it('preserves entity raw values in relations EN/DE', () => {
    const enDetail = buildDetail('en');
    const deDetail = buildDetail('de');
    expect(enDetail.relations.customer?.primary).toBe(CUSTOMER_NAME);
    expect(deDetail.relations.customer?.primary).toBe(CUSTOMER_NAME);
    expect(enDetail.relations.booking?.primary).toBe(BOOKING_NUMBER);
    expect(deDetail.relations.booking?.primary).toBe(BOOKING_NUMBER);
    expect(enDetail.relations.vehicle?.secondary).toBe(VEHICLE_PLATE);
    expect(deDetail.relations.vehicle?.secondary).toBe(VEHICLE_PLATE);
  });

  it('localizes relations heading without changing navigation entity IDs', () => {
    const detail = buildDetail('en');
    const onOpenCustomer = vi.fn();
    const { container: view } = renderWithLocale(
      'en',
      createElement(InvoiceRelations, {
        detail,
        navigation: { onOpenCustomer },
        ...theme,
      }),
    );
    expect(view.textContent).toContain(en['rental.invoice.detail.primary.relations.heading']);
    const button = view.querySelector('button');
    act(() => button?.click());
    expect(onOpenCustomer).toHaveBeenCalledWith('cust-x7');
  });

  it('keeps status machine IDs and tone/icon mapping across locales', () => {
    const statuses = [
      'DRAFT',
      'ISSUED',
      'SENT',
      'PARTIALLY_PAID',
      'PAID',
      'OVERDUE',
      'CANCELLED',
      'CREDITED',
      'VOID',
      'UPLOADED',
      'NEEDS_REVIEW',
      'APPROVED',
      'BOOKED',
      'REJECTED',
    ] as const;
    for (const status of statuses) {
      const enDetail = buildDetail('en', sampleInvoice({ status }));
      const deDetail = buildDetail('de', sampleInvoice({ status }));
      expect(enDetail.core.status).toBe(status);
      expect(deDetail.core.status).toBe(status);
      expect(invoiceStatusTone(enDetail.core.status)).toBe(invoiceStatusTone(deDetail.core.status));
      expect(enDetail.core.statusLabel).toBe(en[`invoices.list.status.${status}`]);
      expect(deDetail.core.statusLabel).toBe(de[`invoices.list.status.${status}`]);
    }
  });

  it('preserves action eligibility while localizing gate reasons', () => {
    const dto = buildDetail('en', sampleInvoice({ generatedDocumentId: null }));
    expect(dto.primary.sendEmail.allowed).toBe(false);
    expect(dto.primary.sendEmail.reason).toBe(en['rental.invoice.detail.primary.gate.emailNeedsPdf']);
    const deDto = buildDetail('de', sampleInvoice({ generatedDocumentId: null }));
    expect(deDto.primary.sendEmail.allowed).toBe(dto.primary.sendEmail.allowed);
    expect(deDto.primary.sendEmail.reason).toBe(de['rental.invoice.detail.primary.gate.emailNeedsPdf']);
  });

  it('same-mount DE→EN switches presentation only', () => {
    const { container: view } = renderWithLocale(
      'de',
      createElement(LocaleSwitchHarness, null, createElement(HeaderHarness)),
    );
    expect(view.textContent).toContain(de['rental.invoice.detail.primary.amount.paid']);
    const toggle = view.querySelector('[data-testid="toggle-locale"]');
    act(() => toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(view.textContent).toContain(en['rental.invoice.detail.primary.amount.paid']);
    expect(view.textContent).toContain(INVOICE_NUMBER);
  });

  it('localizes more-menu trigger in EN', () => {
    const detail = buildDetail('en', sampleInvoice({ status: 'ISSUED' }));
    const { container: view } = renderWithLocale(
      'en',
      createElement(InvoiceHeaderMoreMenu, {
        actions: detail.actions,
      }),
    );
    expect(view.textContent).toContain(en['rental.invoice.detail.primary.menu.more']);
  });
});
