import { BookingPreparationStateService } from './booking-preparation-state.service';
import { BOOKING_PREPARATION_ARTIFACT_TYPES } from './booking-preparation.constants';

describe('BookingPreparationStateService', () => {
  function buildService(options?: {
    booking?: Record<string, unknown> | null;
    priceSnapshot?: { id: string } | null;
    invoice?: { id: string } | null;
    rentalContract?: { id: string; generatedDocumentId: string | null } | null;
    consumerReceipts?: Array<{ consumerId: string; status: string; lastError: string | null; id: string }>;
    rows?: Array<Record<string, unknown>>;
  }) {
    const upsertArtifact = jest.fn().mockResolvedValue({});
    const repo = {
      findByBooking: jest.fn().mockResolvedValue(options?.rows ?? []),
      upsertArtifact,
      findArtifact: jest.fn().mockResolvedValue(null),
    };

    const prisma = {
      booking: {
        findFirst: jest.fn().mockResolvedValue(
          options?.booking === null
            ? null
            : {
                id: 'bk-1',
                organizationId: 'org-1',
                status: 'CONFIRMED',
                paymentIntent: null,
                ...(options?.booking ?? {}),
              },
        ),
      },
      bookingPriceSnapshot: {
        findUnique: jest.fn().mockResolvedValue(
          options && 'priceSnapshot' in (options ?? {})
            ? options.priceSnapshot
            : { id: 'snap-1' },
        ),
      },
      orgInvoice: {
        findFirst: jest.fn().mockResolvedValue(options?.invoice ?? null),
      },
      bookingPaymentRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      bookingDocumentGenerationJob: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      orgTask: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      bookingDomainEventConsumerReceipt: {
        findMany: jest.fn().mockResolvedValue(options?.consumerReceipts ?? []),
      },
      outboundEmail: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      rentalContract: {
        findUnique: jest.fn().mockResolvedValue(options?.rentalContract ?? null),
      },
      bookingDocumentBundle: {
        findUnique: jest.fn().mockResolvedValue({ id: 'bundle-1' }),
      },
    };

    const completeness = {
      evaluateForBooking: jest.fn().mockResolvedValue({
        missingItems: [{ documentType: 'TERMS_AND_CONDITIONS', reason: 'AGB fehlt' }],
      }),
    };

    const service = new BookingPreparationStateService(
      prisma as any,
      repo as any,
      completeness as any,
    );

    return { service, repo, upsertArtifact, prisma };
  }

  it('marks pricing as pending when snapshot is missing', async () => {
    const { service, upsertArtifact } = buildService({ priceSnapshot: null });
    await service.reconcile('org-1', 'bk-1');

    expect(upsertArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: BOOKING_PREPARATION_ARTIFACT_TYPES.PRICING,
        status: 'PENDING',
      }),
    );
  });

  it('reports pickup blocking when invoice artifact is not ready', async () => {
    const { service, repo } = buildService({
      rows: [
        {
          artifactType: BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE,
          status: 'FAILED',
          required: true,
          blocksPickup: true,
          blocksReturn: false,
          lastError: 'Rechnung fehlt',
          lastErrorCode: null,
          lastAttemptAt: new Date(),
          readyAt: null,
          retryCount: 0,
          nextRetryAt: null,
        },
      ],
    });

    const snapshot = await service.getSnapshot('org-1', 'bk-1');
    expect(snapshot.blocksPickup).toBe(true);
    expect(snapshot.isOperationallyReady).toBe(false);
    expect(snapshot.pickupBlockReasons.some((r) => r.includes('Rechnung'))).toBe(true);
    expect(repo.findByBooking).toHaveBeenCalled();
  });

  it('marks rental agreement failed from consumer receipt', async () => {
    const { service, upsertArtifact } = buildService({
      consumerReceipts: [
        {
          id: 'rcpt-1',
          consumerId: 'booking.rental-agreement',
          status: 'FAILED',
          lastError: 'PDF render failed',
        },
      ],
    });

    await service.reconcile('org-1', 'bk-1');

    expect(upsertArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactType: BOOKING_PREPARATION_ARTIFACT_TYPES.RENTAL_AGREEMENT,
        status: 'FAILED',
        lastError: 'PDF render failed',
      }),
    );
  });
});
