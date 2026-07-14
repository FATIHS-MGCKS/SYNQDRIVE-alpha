import { readFileSync } from 'fs';
import { resolve } from 'path';

import { BookingWizardDraftService } from '@modules/bookings/booking-wizard-draft.service';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { PricingService } from '@modules/pricing/pricing.service';
import { PricingQuoteService } from '@modules/pricing/pricing-quote.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { BookingInvoiceLifecycleService } from '@modules/invoices/booking-invoice-lifecycle.service';
import { BookingDocumentEmailService } from '@modules/outbound-email/booking-document-email.service';
import { WIZARD_DRAFT_MARKER } from '@modules/bookings/booking-wizard-draft.util';
import { BOOKING_REF, ORG_A } from './__fixtures__/invoice-baseline.fixtures';

describe('Booking wizard → invoice baseline flow', () => {
  const wizardDraftBooking = {
    id: BOOKING_REF,
    organizationId: ORG_A,
    customerId: 'cust-1',
    vehicleId: 'veh-1',
    status: 'PENDING',
    notes: WIZARD_DRAFT_MARKER,
    startDate: new Date('2026-07-14'),
    endDate: new Date('2026-07-17'),
    totalPriceCents: 53550,
    dailyRateCents: 17850,
    currency: 'EUR',
    kmIncluded: 300,
  };

  let invoicesService: { createBookingInvoice: jest.Mock };
  let bundleService: { generateInitialBundle: jest.Mock; getBundleView: jest.Mock };
  let lifecycle: { syncOnBookingConfirmed: jest.Mock };
  let bookingsService: { update: jest.Mock; cancel: jest.Mock };
  let emailService: { maybeAutoSendBookingDocuments: jest.Mock };
  let prisma: { booking: { findFirst: jest.Mock } };
  let service: BookingWizardDraftService;

  beforeEach(() => {
    invoicesService = {
      createBookingInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    };
    bundleService = {
      generateInitialBundle: jest.fn().mockResolvedValue({
        bundle: { status: 'PARTIAL' },
        documents: [{ documentType: 'BOOKING_INVOICE', id: 'doc-1' }],
      }),
      getBundleView: jest.fn().mockResolvedValue({
        bundle: { status: 'PARTIAL' },
        documents: [{ documentType: 'BOOKING_INVOICE', id: 'doc-1' }],
      }),
    };
    lifecycle = {
      syncOnBookingConfirmed: jest.fn().mockResolvedValue({ status: 'ISSUED' }),
    };
    bookingsService = {
      update: jest.fn().mockResolvedValue({ ...wizardDraftBooking, status: 'CONFIRMED' }),
      cancel: jest.fn(),
    };
    emailService = {
      maybeAutoSendBookingDocuments: jest.fn().mockResolvedValue({ sent: false }),
    };
    prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(wizardDraftBooking) },
    };

    service = new BookingWizardDraftService(
      prisma as unknown as PrismaService,
      bookingsService as unknown as BookingsService,
      {} as PricingService,
      {} as PricingQuoteService,
      bundleService as unknown as BookingDocumentBundleService,
      {} as GeneratedDocumentsService,
      invoicesService as unknown as InvoicesService,
      lifecycle as unknown as BookingInvoiceLifecycleService,
      emailService as unknown as BookingDocumentEmailService,
    );
  });

  it('refreshDraftBundle creates booking invoice then generates document bundle (BOOKING_INVOICE)', async () => {
    const refresh = (service as any).refreshDraftBundle.bind(service);
    await refresh(ORG_A, BOOKING_REF, 'user-1', wizardDraftBooking);

    expect(invoicesService.createBookingInvoice).toHaveBeenCalledWith(
      ORG_A,
      expect.objectContaining({ id: BOOKING_REF }),
    );
    expect(bundleService.generateInitialBundle).toHaveBeenCalledWith(ORG_A, BOOKING_REF, 'user-1');
  });

  it('confirmDraft syncs invoice lifecycle and attempts document auto-send', async () => {
    await service.confirmDraft(
      ORG_A,
      BOOKING_REF,
      { status: 'CONFIRMED', paymentMethod: 'card' },
      { userId: 'user-1' },
    );

    expect(lifecycle.syncOnBookingConfirmed).toHaveBeenCalledWith(
      ORG_A,
      BOOKING_REF,
      expect.objectContaining({ paymentMethod: 'card', userId: 'user-1' }),
    );
    expect(emailService.maybeAutoSendBookingDocuments).toHaveBeenCalledWith(
      ORG_A,
      BOOKING_REF,
      'user-1',
    );
  });

  it('confirmDraft still returns when invoice sync throws (current silent error path)', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    lifecycle.syncOnBookingConfirmed.mockRejectedValue(new Error('invoice sync failed'));

    const result = await service.confirmDraft(
      ORG_A,
      BOOKING_REF,
      { status: 'CONFIRMED', paymentMethod: 'invoice' },
      { userId: 'user-1' },
    );

    expect(result.booking).toBeDefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('Booking create → invoice/document sync error swallowing (regression locks)', () => {
  const bookingsSource = readFileSync(
    resolve(__dirname, '../bookings/bookings.service.ts'),
    'utf8',
  );
  const wizardSource = readFileSync(
    resolve(__dirname, '../bookings/booking-wizard-draft.service.ts'),
    'utf8',
  );

  it('bookings.service catches createBookingInvoice failures without surfacing', () => {
    expect(bookingsSource).toContain('createBookingInvoice');
    expect(bookingsSource).toMatch(/createBookingInvoice[\s\S]{0,400}\.catch\(\(\) => null\)/);
  });

  it('bookings.service catches bundle/email failures after invoice creation', () => {
    expect(bookingsSource).toMatch(/generateInitialBundle[\s\S]{0,600}\.catch\(\(\) => \{\}\)/);
  });

  it('wizard refreshDraftBundle catches createBookingInvoice failures', () => {
    expect(wizardSource).toContain('createBookingInvoice');
    expect(wizardSource).toContain('.catch(() => null)');
    const refreshIdx = wizardSource.indexOf('refreshDraftBundle');
    const catchIdx = wizardSource.indexOf('.catch(() => null)', refreshIdx);
    expect(catchIdx).toBeGreaterThan(refreshIdx);
  });

  it('wizard confirmDraft catches syncOnBookingConfirmed failures', () => {
    expect(wizardSource).toMatch(/syncOnBookingConfirmed[\s\S]{0,300}\.catch\(/);
  });
});

describe.skip('target state — enable after sync error handling (phase P3)', () => {
  it('confirmDraft should surface invoice sync failures to the caller', () => {
    // Replace with behavioral test once errors propagate.
  });
});
