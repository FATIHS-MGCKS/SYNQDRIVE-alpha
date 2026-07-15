import { expect, type Page } from '@playwright/test';

import { assertNoHorizontalOverflow } from './document-upload-fixtures';
import type {
  Invoice,
  InvoiceListItem,
  InvoicePayment,
  InvoiceStats,
} from '../src/rental/components/invoices/invoiceTypes';
import type {
  InvoiceDeliveryHistoryItem,
  InvoiceDocumentsPanel,
} from '../src/rental/components/invoices/invoiceDocumentTypes';
import type { InvoiceTimelinePanel } from '../src/rental/components/invoices/invoiceTimelineTypes';

export { assertNoHorizontalOverflow };

export const TEST_ORG_ID = 'org-invoice-e2e';
export const CUSTOMER_ID = 'cust-e2e-anna';
export const CUSTOMER_NO_EMAIL_ID = 'cust-e2e-no-email';
export const BOOKING_ID = 'book-e2e-1001';
export const VEHICLE_ID = 'veh-e2e-bmw';
export const DOC_ID = 'doc-e2e-main';
export const EMAIL_FAILED_ID = 'email-failed-e2e';
export const EMAIL_SENT_ID = 'email-sent-e2e';

export const INVOICE_MAIN_ID = 'inv-main-e2e';
export const INVOICE_PAID_ID = 'inv-paid-e2e';
export const INVOICE_NO_BOOKING_ID = 'inv-no-booking-e2e';
export const INVOICE_NO_EMAIL_ID = 'inv-no-email-e2e';
export const INVOICE_DOC_ERROR_ID = 'inv-doc-error-e2e';
export const INVOICE_DOC_MISSING_ID = 'inv-doc-missing-e2e';

export const MAIN_INVOICE_NUMBER = '2026-0042';

export const mockUser = {
  id: 'user-invoice-e2e',
  email: 'finance@synqdrive.eu',
  name: 'Finance E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: TEST_ORG_ID,
  organizationName: 'Invoice E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    invoices: { read: true, write: true, manage: true },
    customers: { read: true, write: true, manage: true },
    bookings: { read: true, write: true, manage: true },
    fleet: { read: true, write: true, manage: true },
    vehicles: { read: true, write: true, manage: true },
  },
};

const cap = (allowed: boolean, reason: string | null = null) => ({ allowed, reason });

function baseDocCapabilities() {
  return {
    preview: cap(true),
    download: cap(true),
    sendEmail: cap(true),
    generate: cap(false, 'Bereits vorhanden'),
    regenerate: cap(true),
    retry: cap(false, 'Kein fehlgeschlagener Versuch'),
  };
}

function emptyDocumentsPanel(): InvoiceDocumentsPanel {
  return {
    panelState: 'EMPTY',
    activeDocument: null,
    versions: [],
    generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
    capabilities: {
      preview: cap(false, 'Noch kein PDF vorhanden'),
      download: cap(false, 'Noch kein PDF vorhanden'),
      sendEmail: cap(false, 'PDF muss zuerst erzeugt werden'),
      generate: cap(true),
      regenerate: cap(false, 'Zuerst PDF erzeugen'),
      retry: cap(false, 'Kein fehlgeschlagener Versuch'),
    },
    deliveryHistory: [],
    hasIncomingAttachment: false,
  };
}

function activeDocumentsPanel(
  deliveryHistory: InvoiceDeliveryHistoryItem[] = [],
  overrides?: Partial<InvoiceDocumentsPanel['capabilities']>,
): InvoiceDocumentsPanel {
  return {
    panelState: 'ACTIVE',
    activeDocument: {
      id: DOC_ID,
      fileName: 'rechnung-2026-0042.pdf',
      documentType: 'BOOKING_INVOICE',
      documentTypeLabel: 'Rechnung',
      version: 1,
      isActive: true,
      status: 'GENERATED',
      statusLabel: 'Erzeugt',
      createdAt: '2026-07-14T12:00:00.000Z',
      createdByName: 'Finance E2E',
      sizeBytes: 20480,
      sizeLabel: '20 KB',
      capabilities: { preview: cap(true), download: cap(true) },
    },
    versions: [],
    generation: { status: 'idle', lastAttemptAt: null, errorMessage: null },
    capabilities: { ...baseDocCapabilities(), ...overrides },
    deliveryHistory,
    hasIncomingAttachment: false,
  };
}

function failedDocumentsPanel(): InvoiceDocumentsPanel {
  return {
    panelState: 'FAILED',
    activeDocument: null,
    versions: [],
    generation: {
      status: 'failed',
      lastAttemptAt: '2026-07-14T11:30:00.000Z',
      errorMessage: 'Renderer nicht erreichbar — bitte später erneut versuchen.',
    },
    capabilities: {
      preview: cap(false, 'Kein PDF vorhanden'),
      download: cap(false, 'Kein PDF vorhanden'),
      sendEmail: cap(false, 'PDF muss zuerst erzeugt werden'),
      generate: cap(true),
      regenerate: cap(false, 'Zuerst PDF erzeugen'),
      retry: cap(true),
    },
    deliveryHistory: [],
    hasIncomingAttachment: false,
  };
}

function createMainInvoice(): Invoice {
  return {
    id: INVOICE_MAIN_ID,
    invoiceNumber: 42,
    invoiceNumberDisplay: MAIN_INVOICE_NUMBER,
    type: 'OUTGOING_BOOKING',
    customerId: CUSTOMER_ID,
    vendorId: null,
    vendorName: null,
    bookingId: BOOKING_ID,
    vehicleId: VEHICLE_ID,
    title: 'Mietrechnung Juli',
    description: 'BMW 320d — 5 Tage',
    lineItems: [
      {
        description: 'Tagesmiete',
        quantity: 5,
        unitPriceNetCents: 8403,
        taxRate: 19,
        grossCents: 10000,
      },
    ],
    subtotalCents: 8403,
    taxCents: 1597,
    totalCents: 10000,
    paidCents: 0,
    outstandingCents: 10000,
    currency: 'EUR',
    invoiceDate: '2026-07-01T00:00:00.000Z',
    dueDate: '2026-07-15T00:00:00.000Z',
    status: 'ISSUED',
    templateId: 'booking',
    imageUrl: null,
    extractedData: null,
    generatedDocumentId: null,
    notes: '',
    paidAt: null,
    issuedAt: '2026-07-01T10:00:00.000Z',
    createdAt: '2026-07-01T09:00:00.000Z',
    payments: [],
  };
}

function createListItems(): InvoiceListItem[] {
  return [
    {
      id: INVOICE_MAIN_ID,
      invoiceNumber: MAIN_INVOICE_NUMBER,
      type: 'OUTGOING_BOOKING',
      direction: 'outgoing',
      status: 'ISSUED',
      title: 'Mietrechnung Juli',
      customerDisplayName: 'Anna Schmidt',
      customerId: CUSTOMER_ID,
      supplierDisplayName: null,
      supplierId: null,
      bookingNumber: 'BK-1001',
      bookingId: BOOKING_ID,
      vehicleDisplayName: 'BMW 320d',
      licensePlate: 'B-AN 42',
      invoiceDate: '2026-07-01T00:00:00.000Z',
      dueDate: '2026-07-15T00:00:00.000Z',
      totalGross: 10000,
      paidAmount: 0,
      outstandingAmount: 10000,
      currency: 'EUR',
      documentStatus: null,
      activeDocumentId: null,
      lastSendStatus: 'FAILED',
      lastSentAt: null,
      isOverdue: false,
      sourceType: 'BOOKING',
      creationChannel: 'Buchung',
      openTaskCount: 0,
      hasOpenTask: false,
    },
    {
      id: INVOICE_PAID_ID,
      invoiceNumber: '2026-0099',
      type: 'OUTGOING_MANUAL',
      direction: 'outgoing',
      status: 'PAID',
      title: 'Servicepauschale',
      customerDisplayName: 'Peter Weber',
      customerId: 'cust-e2e-peter',
      supplierDisplayName: null,
      supplierId: null,
      bookingNumber: null,
      bookingId: null,
      vehicleDisplayName: 'Audi A4',
      licensePlate: 'M-AB 123',
      invoiceDate: '2026-06-10T00:00:00.000Z',
      dueDate: '2026-06-20T00:00:00.000Z',
      totalGross: 5950,
      paidAmount: 5950,
      outstandingAmount: 0,
      currency: 'EUR',
      documentStatus: 'GENERATED',
      activeDocumentId: 'doc-paid',
      lastSendStatus: 'SENT',
      lastSentAt: '2026-06-11T08:00:00.000Z',
      isOverdue: false,
      sourceType: 'MANUAL',
      creationChannel: 'Manuell',
      openTaskCount: 0,
      hasOpenTask: false,
    },
    {
      id: INVOICE_DOC_MISSING_ID,
      invoiceNumber: '2026-0200',
      type: 'OUTGOING_MANUAL',
      direction: 'outgoing',
      status: 'ISSUED',
      title: 'Ohne PDF',
      customerDisplayName: 'Lisa Koch',
      customerId: 'cust-e2e-lisa',
      supplierDisplayName: null,
      supplierId: null,
      bookingNumber: null,
      bookingId: null,
      vehicleDisplayName: null,
      licensePlate: 'HH-LK 9',
      invoiceDate: '2026-07-05T00:00:00.000Z',
      dueDate: '2026-07-20T00:00:00.000Z',
      totalGross: 2500,
      paidAmount: 0,
      outstandingAmount: 2500,
      currency: 'EUR',
      documentStatus: null,
      activeDocumentId: null,
      lastSendStatus: null,
      lastSentAt: null,
      isOverdue: false,
      sourceType: 'MANUAL',
      creationChannel: 'Manuell',
      openTaskCount: 0,
      hasOpenTask: false,
    },
    {
      id: INVOICE_NO_BOOKING_ID,
      invoiceNumber: '2026-0150',
      type: 'OUTGOING_MANUAL',
      direction: 'outgoing',
      status: 'ISSUED',
      title: 'Manuelle Rechnung',
      customerDisplayName: 'Tom Berger',
      customerId: 'cust-e2e-tom',
      supplierDisplayName: null,
      supplierId: null,
      bookingNumber: null,
      bookingId: null,
      vehicleDisplayName: null,
      licensePlate: null,
      invoiceDate: '2026-07-08T00:00:00.000Z',
      dueDate: '2026-07-22T00:00:00.000Z',
      totalGross: 7500,
      paidAmount: 0,
      outstandingAmount: 7500,
      currency: 'EUR',
      documentStatus: 'GENERATED',
      activeDocumentId: 'doc-no-booking',
      lastSendStatus: null,
      lastSentAt: null,
      isOverdue: false,
      sourceType: 'MANUAL',
      creationChannel: 'Manuell',
      openTaskCount: 0,
      hasOpenTask: false,
    },
    {
      id: INVOICE_NO_EMAIL_ID,
      invoiceNumber: '2026-0160',
      type: 'OUTGOING_BOOKING',
      direction: 'outgoing',
      status: 'ISSUED',
      title: 'Ohne Kunden-E-Mail',
      customerDisplayName: 'Ohne Mail Kunde',
      customerId: CUSTOMER_NO_EMAIL_ID,
      supplierDisplayName: null,
      supplierId: null,
      bookingNumber: 'BK-2002',
      bookingId: 'book-e2e-2002',
      vehicleDisplayName: 'VW Golf',
      licensePlate: 'B-OG 60',
      invoiceDate: '2026-07-09T00:00:00.000Z',
      dueDate: '2026-07-23T00:00:00.000Z',
      totalGross: 8900,
      paidAmount: 0,
      outstandingAmount: 8900,
      currency: 'EUR',
      documentStatus: 'GENERATED',
      activeDocumentId: 'doc-no-email',
      lastSendStatus: null,
      lastSentAt: null,
      isOverdue: false,
      sourceType: 'BOOKING',
      creationChannel: 'Buchung',
      openTaskCount: 0,
      hasOpenTask: false,
    },
    {
      id: INVOICE_DOC_ERROR_ID,
      invoiceNumber: '2026-0175',
      type: 'OUTGOING_BOOKING',
      direction: 'outgoing',
      status: 'ISSUED',
      title: 'PDF-Fehler',
      customerDisplayName: 'Fehler Fall',
      customerId: 'cust-e2e-error',
      supplierDisplayName: null,
      supplierId: null,
      bookingNumber: 'BK-3003',
      bookingId: 'book-e2e-3003',
      vehicleDisplayName: 'Mercedes C',
      licensePlate: 'S-FE 75',
      invoiceDate: '2026-07-10T00:00:00.000Z',
      dueDate: '2026-07-24T00:00:00.000Z',
      totalGross: 12000,
      paidAmount: 0,
      outstandingAmount: 12000,
      currency: 'EUR',
      documentStatus: 'FAILED',
      activeDocumentId: null,
      lastSendStatus: null,
      lastSentAt: null,
      isOverdue: false,
      sourceType: 'BOOKING',
      creationChannel: 'Buchung',
      openTaskCount: 0,
      hasOpenTask: false,
    },
  ];
}

function createInitialTimeline(invoiceId: string): InvoiceTimelinePanel {
  if (invoiceId === INVOICE_MAIN_ID) {
    return {
      sortOrder: 'desc',
      isLegacyReduced: false,
      timezone: 'Europe/Berlin',
      events: [
        {
          id: 'tl-created',
          kind: 'INVOICE_CREATED',
          label: 'Rechnung erstellt',
          occurredAt: '2026-07-01T09:00:00.000Z',
          actorType: 'system',
          actorLabel: 'System',
          channel: null,
          reference: null,
          detail: null,
          tone: 'info',
        },
        {
          id: 'tl-issued',
          kind: 'INVOICE_ISSUED',
          label: 'Rechnung ausgestellt',
          occurredAt: '2026-07-01T10:00:00.000Z',
          actorType: 'user',
          actorLabel: 'Finance E2E',
          channel: null,
          reference: MAIN_INVOICE_NUMBER,
          detail: null,
          tone: 'success',
        },
      ],
    };
  }
  return {
    sortOrder: 'desc',
    isLegacyReduced: false,
    timezone: 'Europe/Berlin',
    events: [],
  };
}

function failedDeliveryHistory(): InvoiceDeliveryHistoryItem[] {
  return [
    {
      id: EMAIL_FAILED_ID,
      recipient: 'anna.schmidt@example.com',
      channelLabel: 'E-Mail',
      documentVersionLabel: 'Version 1',
      sentAt: null,
      createdAt: '2026-07-13T14:00:00.000Z',
      triggeredByName: 'Finance E2E',
      status: 'FAILED',
      statusLabel: 'Fehlgeschlagen',
      errorMessage: 'SMTP-Verbindung abgebrochen',
      capabilities: { retry: cap(true) },
    },
  ];
}

type MockStore = {
  invoices: Map<string, Invoice>;
  listItems: InvoiceListItem[];
  documentPanels: Map<string, InvoiceDocumentsPanel>;
  timelines: Map<string, InvoiceTimelinePanel>;
  generatingPolls: Map<string, number>;
};

function buildStore(): MockStore {
  const invoices = new Map<string, Invoice>();
  invoices.set(INVOICE_MAIN_ID, createMainInvoice());

  const noBooking: Invoice = {
    ...createMainInvoice(),
    id: INVOICE_NO_BOOKING_ID,
    invoiceNumber: 150,
    invoiceNumberDisplay: '2026-0150',
    type: 'OUTGOING_MANUAL',
    bookingId: null,
    vehicleId: null,
    title: 'Manuelle Rechnung',
    customerId: 'cust-e2e-tom',
    generatedDocumentId: 'doc-no-booking',
    totalCents: 7500,
    outstandingCents: 7500,
    subtotalCents: 6303,
    taxCents: 1197,
  };
  invoices.set(INVOICE_NO_BOOKING_ID, noBooking);

  const noEmail: Invoice = {
    ...createMainInvoice(),
    id: INVOICE_NO_EMAIL_ID,
    invoiceNumber: 160,
    invoiceNumberDisplay: '2026-0160',
    customerId: CUSTOMER_NO_EMAIL_ID,
    bookingId: 'book-e2e-2002',
    generatedDocumentId: 'doc-no-email',
    totalCents: 8900,
    outstandingCents: 8900,
  };
  invoices.set(INVOICE_NO_EMAIL_ID, noEmail);

  const docError: Invoice = {
    ...createMainInvoice(),
    id: INVOICE_DOC_ERROR_ID,
    invoiceNumber: 175,
    invoiceNumberDisplay: '2026-0175',
    customerId: 'cust-e2e-error',
    bookingId: 'book-e2e-3003',
    totalCents: 12000,
    outstandingCents: 12000,
  };
  invoices.set(INVOICE_DOC_ERROR_ID, docError);

  const documentPanels = new Map<string, InvoiceDocumentsPanel>();
  documentPanels.set(INVOICE_MAIN_ID, emptyDocumentsPanel());
  documentPanels.set(
    INVOICE_NO_BOOKING_ID,
    activeDocumentsPanel([], {
      sendEmail: cap(true),
    }),
  );
  documentPanels.set(INVOICE_NO_EMAIL_ID, activeDocumentsPanel());
  documentPanels.set(INVOICE_DOC_ERROR_ID, failedDocumentsPanel());

  const timelines = new Map<string, InvoiceTimelinePanel>();
  for (const item of createListItems()) {
    timelines.set(item.id, createInitialTimeline(item.id));
  }

  return {
    invoices,
    listItems: createListItems(),
    documentPanels,
    timelines,
    generatingPolls: new Map(),
  };
}

let store = buildStore();

export function resetInvoiceMockState() {
  store = buildStore();
}

function syncListItemFromInvoice(invoice: Invoice) {
  const idx = store.listItems.findIndex((item) => item.id === invoice.id);
  if (idx < 0) return;
  const prev = store.listItems[idx];
  store.listItems[idx] = {
    ...prev,
    status: invoice.status,
    paidAmount: invoice.paidCents,
    outstandingAmount: invoice.outstandingCents,
    documentStatus: store.documentPanels.get(invoice.id)?.activeDocument?.status ?? prev.documentStatus,
    activeDocumentId: store.documentPanels.get(invoice.id)?.activeDocument?.id ?? prev.activeDocumentId,
  };
}

function filterListItems(url: string): InvoiceListItem[] {
  const parsed = new URL(url);
  const q = (parsed.searchParams.get('search') ?? '').trim().toLowerCase();
  const status = parsed.searchParams.get('status');
  const documentStatus = parsed.searchParams.get('documentStatus');
  const direction = parsed.searchParams.get('direction');

  return store.listItems.filter((item) => {
    if (direction && direction !== 'all' && item.direction !== direction) return false;
    if (status && status !== 'all' && item.status !== status) return false;
    if (documentStatus === 'present' && !item.documentStatus) return false;
    if (documentStatus === 'missing' && item.documentStatus) return false;
    if (documentStatus === 'failed' && item.documentStatus !== 'FAILED') return false;
    if (!q) return true;
    const haystack = [
      item.invoiceNumber,
      item.customerDisplayName,
      item.supplierDisplayName,
      item.licensePlate,
      item.bookingNumber,
      item.vehicleDisplayName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

function statsFromList(): InvoiceStats {
  const statusCounts: Record<string, number> = {};
  for (const item of store.listItems) {
    statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
  }
  return {
    total: store.listItems.length,
    outgoing: store.listItems.filter((i) => i.direction === 'outgoing').length,
    incoming: store.listItems.filter((i) => i.direction === 'incoming').length,
    paid: store.listItems.filter((i) => i.status === 'PAID').length,
    unpaid: store.listItems.filter((i) => i.outstandingAmount > 0).length,
    overdue: store.listItems.filter((i) => i.isOverdue).length,
    statusCounts,
    totalRevenueCents: store.listItems.reduce((sum, i) => sum + i.totalGross, 0),
    paidRevenueCents: store.listItems.reduce((sum, i) => sum + i.paidAmount, 0),
    totalExpensesCents: 0,
  };
}

function appendTimeline(
  invoiceId: string,
  event: InvoiceTimelinePanel['events'][number],
) {
  const panel = store.timelines.get(invoiceId) ?? createInitialTimeline(invoiceId);
  store.timelines.set(invoiceId, {
    ...panel,
    events: [event, ...panel.events],
  });
}

function recordPaymentOnInvoice(
  invoiceId: string,
  amountCents: number,
  method: string,
  reference?: string,
): Invoice {
  const invoice = store.invoices.get(invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  const payment: InvoicePayment = {
    id: `pay-${Date.now()}`,
    amountCents,
    method,
    paidAt: new Date().toISOString(),
    reference: reference ?? null,
    statusKind: 'recorded',
    statusLabel: 'Erfasst',
    createdByName: 'Finance E2E',
  };

  const paidCents = invoice.paidCents + amountCents;
  const outstandingCents = Math.max(0, invoice.totalCents - paidCents);
  const status =
    outstandingCents <= 0 ? 'PAID' : paidCents > 0 ? 'PARTIALLY_PAID' : invoice.status;

  const updated: Invoice = {
    ...invoice,
    paidCents,
    outstandingCents,
    status,
    paidAt: outstandingCents <= 0 ? new Date().toISOString() : invoice.paidAt,
    payments: [...(invoice.payments ?? []), payment],
  };

  store.invoices.set(invoiceId, updated);
  syncListItemFromInvoice(updated);

  appendTimeline(invoiceId, {
    id: payment.id,
    kind: outstandingCents <= 0 ? 'PAYMENT_FULL' : 'PAYMENT_PARTIAL',
    label: outstandingCents <= 0 ? 'Vollständig bezahlt' : 'Teilzahlung erfasst',
    occurredAt: payment.paidAt,
    actorType: 'user',
    actorLabel: 'Finance E2E',
    channel: null,
    reference: reference ?? null,
    detail: `${(amountCents / 100).toFixed(2)} EUR`,
    tone: 'success',
  });

  return updated;
}

const mockCustomer = {
  id: CUSTOMER_ID,
  name: 'Anna Schmidt',
  email: 'anna.schmidt@example.com',
  phone: '+49 30 123456',
  type: 'PRIVATE',
  status: 'ACTIVE',
};

const mockCustomerNoEmail = {
  id: CUSTOMER_NO_EMAIL_ID,
  name: 'Ohne Mail Kunde',
  email: null,
  phone: '+49 30 999999',
  type: 'PRIVATE',
  status: 'ACTIVE',
};

const mockBooking = {
  core: {
    bookingId: BOOKING_ID,
    bookingNumber: 'BK-1001',
    organizationId: TEST_ORG_ID,
    status: 'CONFIRMED',
    statusEnum: 'CONFIRMED',
    startDate: '2026-07-01T08:00:00.000Z',
    endDate: '2026-07-06T18:00:00.000Z',
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
  vehicle: {
    vehicleId: VEHICLE_ID,
    make: 'BMW',
    model: '320d',
    licensePlate: 'B-AN 42',
    displayName: 'BMW 320d',
  },
};

const mockFleetVehicle = {
  id: VEHICLE_ID,
  vehicleName: 'BMW 320d',
  make: 'BMW',
  model: '320d',
  year: 2023,
  licensePlate: 'B-AN 42',
  license: 'B-AN 42',
};

export async function installInvoiceMocks(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices/list`) && method === 'GET') {
      const filtered = filterListItems(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: filtered,
          meta: { total: filtered.length, page: 1, limit: 20, totalPages: 1 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices/stats`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(statsFromList()),
      });
    }

    if (url.match(/\/organizations\/[^/]+\/invoices\/[^/]+$/) && method === 'GET' && !url.includes('/list')) {
      const id = url.split('/invoices/')[1]?.split('?')[0] ?? '';
      const invoice = store.invoices.get(id);
      if (!invoice) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not found' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(invoice) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/invoices/`) && url.includes('/documents') && method === 'GET' && !url.includes('/generate') && !url.includes('/send-email') && !url.includes('/delivery/')) {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      let panel = store.documentPanels.get(invoiceId) ?? emptyDocumentsPanel();

      if (panel.panelState === 'GENERATING') {
        const polls = (store.generatingPolls.get(invoiceId) ?? 0) + 1;
        store.generatingPolls.set(invoiceId, polls);
        if (polls >= 2) {
          panel = activeDocumentsPanel(failedDeliveryHistory());
          store.documentPanels.set(invoiceId, panel);
          const invoice = store.invoices.get(invoiceId);
          if (invoice) {
            store.invoices.set(invoiceId, { ...invoice, generatedDocumentId: DOC_ID });
            syncListItemFromInvoice({ ...invoice, generatedDocumentId: DOC_ID });
          }
          appendTimeline(invoiceId, {
            id: 'tl-pdf',
            kind: 'PDF_GENERATED',
            label: 'PDF erzeugt',
            occurredAt: new Date().toISOString(),
            actorType: 'user',
            actorLabel: 'Finance E2E',
            channel: null,
            reference: 'rechnung-2026-0042.pdf',
            detail: null,
            tone: 'success',
          });
        }
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(panel) });
    }

    if (url.includes('/documents/generate') && method === 'POST') {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      store.generatingPolls.set(invoiceId, 0);
      const generatingPanel: InvoiceDocumentsPanel = {
        panelState: 'GENERATING',
        activeDocument: null,
        versions: [],
        generation: { status: 'processing', lastAttemptAt: new Date().toISOString(), errorMessage: null },
        capabilities: {
          preview: cap(false, 'PDF wird erzeugt'),
          download: cap(false, 'PDF wird erzeugt'),
          sendEmail: cap(false, 'PDF wird erzeugt'),
          generate: cap(false, 'PDF wird bereits erzeugt'),
          regenerate: cap(false, 'PDF wird bereits erzeugt'),
          retry: cap(false, 'PDF wird erzeugt'),
        },
        deliveryHistory: store.documentPanels.get(invoiceId)?.deliveryHistory ?? [],
        hasIncomingAttachment: false,
      };
      store.documentPanels.set(invoiceId, generatingPanel);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(generatingPanel) });
    }

    if (url.includes('/documents/send-email') && method === 'POST') {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      const payload = route.request().postDataJSON() as { toEmail?: string };
      const panel = store.documentPanels.get(invoiceId) ?? activeDocumentsPanel();
      const sent: InvoiceDeliveryHistoryItem = {
        id: EMAIL_SENT_ID,
        recipient: payload.toEmail ?? 'unbekannt@example.com',
        channelLabel: 'E-Mail',
        documentVersionLabel: 'Version 1',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        triggeredByName: 'Finance E2E',
        status: 'SENT',
        statusLabel: 'Gesendet',
        errorMessage: null,
        capabilities: { retry: cap(false, 'Versand erfolgreich') },
      };
      const nextPanel = {
        ...panel,
        deliveryHistory: [sent, ...panel.deliveryHistory],
      };
      store.documentPanels.set(invoiceId, nextPanel);
      appendTimeline(invoiceId, {
        id: EMAIL_SENT_ID,
        kind: 'DELIVERY_SENT',
        label: 'Per E-Mail gesendet',
        occurredAt: sent.sentAt!,
        actorType: 'user',
        actorLabel: 'Finance E2E',
        channel: 'E-Mail',
        reference: payload.toEmail ?? null,
        detail: null,
        tone: 'success',
      });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: EMAIL_SENT_ID, status: 'SENT' }),
      });
    }

    if (url.includes('/documents/delivery/') && url.includes('/retry') && method === 'POST') {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      const emailId = url.split('/delivery/')[1]?.split('/')[0] ?? '';
      const panel = store.documentPanels.get(invoiceId);
      if (!panel) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      const nextHistory = panel.deliveryHistory.map((row) =>
        row.id === emailId
          ? {
              ...row,
              status: 'SENT',
              statusLabel: 'Gesendet',
              sentAt: new Date().toISOString(),
              errorMessage: null,
              capabilities: { retry: cap(false, 'Versand erfolgreich') },
            }
          : row,
      );
      store.documentPanels.set(invoiceId, { ...panel, deliveryHistory: nextHistory });
      appendTimeline(invoiceId, {
        id: `retry-${emailId}`,
        kind: 'DELIVERY_RETRY',
        label: 'Versand erneut versucht',
        occurredAt: new Date().toISOString(),
        actorType: 'user',
        actorLabel: 'Finance E2E',
        channel: 'E-Mail',
        reference: emailId,
        detail: null,
        tone: 'info',
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: emailId, status: 'SENT' }) });
    }

    if (url.includes('/mark-sent') && method === 'POST') {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      const invoice = store.invoices.get(invoiceId);
      if (!invoice) return route.fulfill({ status: 404, body: '{}' });
      const updated = { ...invoice, status: 'SENT', sentAt: new Date().toISOString() };
      store.invoices.set(invoiceId, updated);
      syncListItemFromInvoice(updated);
      appendTimeline(invoiceId, {
        id: `ext-${Date.now()}`,
        kind: 'DELIVERY_EXTERNALLY_MARKED',
        label: 'Externer Versand erfasst',
        occurredAt: new Date().toISOString(),
        actorType: 'user',
        actorLabel: 'Finance E2E',
        channel: 'Extern',
        reference: null,
        detail: null,
        tone: 'info',
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    }

    if (url.includes('/payments') && method === 'POST') {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      const payload = route.request().postDataJSON() as {
        amountCents?: number;
        method?: string;
        reference?: string;
      };
      const updated = recordPaymentOnInvoice(
        invoiceId,
        payload.amountCents ?? 0,
        payload.method ?? 'BANK_TRANSFER',
        payload.reference,
      );
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(updated) });
    }

    if (url.includes('/timeline') && method === 'GET') {
      const invoiceId = url.split('/invoices/')[1]?.split('/')[0] ?? '';
      const panel = store.timelines.get(invoiceId) ?? createInitialTimeline(invoiceId);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(panel) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/documents/`) && url.includes('/download') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: Buffer.from('%PDF-1.4 invoice-e2e-mock'),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/stations`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/pickups`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today/returns`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/today`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (
      url.includes(`/organizations/${TEST_ORG_ID}/invoices`) &&
      method === 'GET' &&
      !url.includes('/list') &&
      !url.match(/\/invoices\/[^/?]+$/)
    ) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/customers/`) && method === 'GET') {
      const customerPath = url.split('/customers/')[1]?.split('?')[0] ?? '';
      const customerId = customerPath.split('/')[0];
      if (customerPath.includes('documents') || customerPath.includes('timeline') || customerPath.includes('fines') || customerPath.includes('invoices')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(customerPath.includes('status') ? { items: [] } : []),
        });
      }
      if (customerId === CUSTOMER_NO_EMAIL_ID) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockCustomerNoEmail),
        });
      }
      if (customerId) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...mockCustomer, id: customerId }),
        });
      }
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-driving-analyses`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings/`) && url.includes('/detail') && method === 'GET') {
      const bookingId = url.split('/bookings/')[1]?.split('/')[0] ?? BOOKING_ID;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBooking,
          core: { ...mockBooking.core, bookingId },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/customers`) && method === 'GET' && !url.includes('/customers/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [mockCustomer, mockCustomerNoEmail], meta: { total: 2 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/bookings`) && method === 'GET' && !url.includes('/today')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id: BOOKING_ID, bookingRef: 'BK-1001' }], meta: { total: 1 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vehicles`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [mockFleetVehicle], meta: { total: 1 } }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/fleet-map`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: VEHICLE_ID,
            vehicleName: 'BMW 320d',
            make: 'BMW',
            model: '320d',
            licensePlate: 'B-AN 42',
            license: 'B-AN 42',
            lat: 52.52,
            lng: 13.405,
            status: 'Available',
          },
        ]),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/rental-health`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ vehicles: [] }) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/vendors`) && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/dashboard-insights`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          hasRun: true,
          stale: false,
          activeInsightCount: 0,
          error: null,
          insights: [],
          summary: { total: 0, critical: 0, warning: 0, opportunity: 0, info: 0 },
        }),
      });
    }

    if (url.includes(`/organizations/${TEST_ORG_ID}/notifications`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.includes('/counts')
            ? {
                totalActive: 0,
                unread: 0,
                critical: 0,
                warning: 0,
                info: 0,
                resolvedRecent: 0,
                byDomain: {},
              }
            : { data: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 } },
        ),
      });
    }

    return route.continue();
  });
}

export async function navigateToInvoicesView(page: Page) {
  const heading = page.getByRole('heading', { name: /^(Rechnungen|Invoices)$/ });
  if (await heading.isVisible().catch(() => false)) return;

  const viewport = page.viewportSize();
  const invoicesLabel = /^(Rechnungen|Invoices)$/;

  if (viewport && viewport.width < 1024) {
    await page.locator('div.lg\\:hidden.fixed.top-0.left-0.right-0 button').first().click();
    await page
      .locator('div.lg\\:hidden.fixed.top-0')
      .getByRole('button', { name: invoicesLabel })
      .click();
  } else {
    const financeHeader = page.getByRole('button', { name: /^(Finanzen|Finance)$/ });
    if (await financeHeader.isVisible().catch(() => false)) {
      const expanded = await financeHeader.getAttribute('aria-expanded');
      if (expanded === 'false') await financeHeader.click();
    }
    await page
      .locator('div.hidden.lg\\:flex')
      .getByRole('button', { name: invoicesLabel })
      .click();
  }

  await heading.waitFor({ state: 'visible', timeout: 30000 });
}

export async function returnToInvoicesList(page: Page) {
  await page.goto('/rental', { waitUntil: 'load' });
  await navigateToInvoicesView(page);
}

export async function openInvoicesPage(
  page: Page,
  options?: { theme?: 'light' | 'dark' },
) {
  await page.addInitScript(
    ({ token, user, locale, theme }) => {
      localStorage.setItem('synqdrive_token', token);
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      if (theme) localStorage.setItem('synqdrive-theme-preference', theme);
    },
    {
      token: 'invoice-e2e-token',
      user: mockUser,
      locale: 'de',
      theme: options?.theme,
    },
  );

  await installInvoiceMocks(page);
  await page.goto('/rental', { waitUntil: 'load' });
  await navigateToInvoicesView(page);
}

export function invoiceListItemLocator(page: Page, invoiceNumber: string) {
  const viewport = page.viewportSize();
  const isMobile = viewport ? viewport.width < 768 : false;
  return isMobile
    ? page.locator(`button[data-testid="invoice-list-item-${invoiceNumber}"]`)
    : page.locator(`tr[data-testid="invoice-list-item-${invoiceNumber}"]`);
}

export async function openInvoiceDetail(page: Page, invoiceNumber = MAIN_INVOICE_NUMBER) {
  await invoiceListItemLocator(page, invoiceNumber).click();
  await expect(page.getByTestId('invoice-detail')).toBeVisible();
}

export async function assertNoVisibleUuids(page: Page) {
  const text = await page.locator('body').innerText();
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  expect(text.match(uuidPattern) ?? []).toEqual([]);
}

export async function assertNoRawTechnicalEnums(page: Page) {
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bVerknüpft\b(?!\s*[·:])/);
  expect(text).not.toMatch(/\bCARD\b/);
  expect(text).not.toMatch(/\bOUTGOING_BOOKING\b/);
  expect(text).not.toMatch(/\bBOOKING_INVOICE\b/);
}

export async function saveInvoiceScreenshot(
  page: Page,
  name: string,
  testInfo: import('@playwright/test').TestInfo,
) {
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach(name, { body: screenshot, contentType: 'image/png' });

  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.join(process.cwd(), 'e2e', 'artifacts', 'invoices');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${name}.png`), screenshot);
}
