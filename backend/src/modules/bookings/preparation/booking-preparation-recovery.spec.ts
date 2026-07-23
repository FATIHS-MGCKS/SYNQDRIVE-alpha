import { NotFoundException } from '@nestjs/common';
import { BookingPreparationRecoveryService } from './booking-preparation-recovery.service';
import { BOOKING_PREPARATION_ARTIFACT_TYPES, BOOKING_PREPARATION_RECOVERY_ACTIONS } from './booking-preparation.constants';

const actor = {
  userId: 'user-1',
  displayName: 'Operator One',
  membershipRole: 'ORG_ADMIN',
  platformRole: null,
};

jest.mock('@shared/auth/permission.util', () => ({
  assertMembershipPermission: jest.fn().mockResolvedValue(undefined),
}));

describe('BookingPreparationRecoveryService', () => {
  function buildService(options?: {
    booking?: Record<string, unknown> | null;
    existingRecovery?: Record<string, unknown> | null;
  }) {
    const prisma = {
      booking: {
        findFirst: jest.fn().mockResolvedValue(
          options?.booking === null
            ? null
            : {
                id: 'bk-1',
                organizationId: 'org-1',
                customerId: 'cust-1',
                vehicleId: 'veh-1',
                status: 'CONFIRMED',
                totalPriceCents: 10000,
                dailyRateCents: 5000,
                startDate: new Date(),
                endDate: new Date(Date.now() + 86_400_000),
                currency: 'EUR',
                kmIncluded: 200,
                pickupStationId: 'st-1',
                returnStationId: 'st-1',
                ...(options?.booking ?? {}),
              },
        ),
      },
    };

    const repo = {
      findRecoveryByKey: jest.fn().mockResolvedValue(options?.existingRecovery ?? null),
      createRecoveryAttempt: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
    };

    const preparationState = {
      markRetryScheduled: jest.fn().mockResolvedValue(undefined),
      reconcile: jest.fn().mockResolvedValue(undefined),
    };

    const businessAudit = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };

    const invoicesService = {
      bootstrapBookingInvoice: jest.fn().mockResolvedValue({ id: 'inv-1' }),
    };

    const documentDispatcher = {
      enqueueInitialBundle: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    const legalEmail = {
      maybeAutoSendFrozenBookingDocuments: jest.fn().mockResolvedValue({ sent: true }),
    };

    const internalEmail = {
      maybeSendBookingInternalNotification: jest.fn().mockResolvedValue({ sent: true }),
    };

    const taskAutomation = {
      ensureBookingLifecycleTasks: jest.fn().mockResolvedValue(undefined),
      onReturnHandoverCompleted: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BookingPreparationRecoveryService(
      prisma as any,
      repo as any,
      preparationState as any,
      businessAudit as any,
      invoicesService as any,
      documentDispatcher as any,
      legalEmail as any,
      internalEmail as any,
      taskAutomation as any,
    );

    return {
      service,
      repo,
      preparationState,
      businessAudit,
      invoicesService,
      documentDispatcher,
      legalEmail,
      internalEmail,
      taskAutomation,
    };
  }

  it('deduplicates recovery by idempotency key', async () => {
    const { service, invoicesService } = buildService({
      existingRecovery: { id: 'attempt-existing' },
    });

    const result = await service.retryArtifact(
      'org-1',
      'bk-1',
      BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE,
      actor,
      'idem-1',
    );

    expect(result.deduplicated).toBe(true);
    expect(result.status).toBe('SKIPPED');
    expect(invoicesService.bootstrapBookingInvoice).not.toHaveBeenCalled();
  });

  it('retries invoice with audit and reconcile', async () => {
    const {
      service,
      invoicesService,
      repo,
      businessAudit,
      preparationState,
    } = buildService({});

    const result = await service.retryArtifact(
      'org-1',
      'bk-1',
      BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE,
      actor,
      'idem-2',
    );

    expect(result.deduplicated).toBe(false);
    expect(result.action).toBe(BOOKING_PREPARATION_RECOVERY_ACTIONS.RETRY_INVOICE);
    expect(invoicesService.bootstrapBookingInvoice).toHaveBeenCalled();
    expect(repo.createRecoveryAttempt).toHaveBeenCalled();
    expect(businessAudit.enqueue).toHaveBeenCalled();
    expect(preparationState.markRetryScheduled).toHaveBeenCalled();
    expect(preparationState.reconcile).toHaveBeenCalledWith('org-1', 'bk-1');
  });

  it('rebuilds tasks for pickup task artifact', async () => {
    const { service, taskAutomation } = buildService({});

    const result = await service.retryArtifact(
      'org-1',
      'bk-1',
      BOOKING_PREPARATION_ARTIFACT_TYPES.PICKUP_TASK,
      actor,
      'idem-3',
    );

    expect(result.action).toBe(BOOKING_PREPARATION_RECOVERY_ACTIONS.REBUILD_TASKS);
    expect(taskAutomation.ensureBookingLifecycleTasks).toHaveBeenCalled();
  });

  it('throws when booking is missing', async () => {
    const { service } = buildService({ booking: null });
    await expect(
      service.retryArtifact(
        'org-1',
        'missing',
        BOOKING_PREPARATION_ARTIFACT_TYPES.INVOICE,
        actor,
        'idem-4',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
