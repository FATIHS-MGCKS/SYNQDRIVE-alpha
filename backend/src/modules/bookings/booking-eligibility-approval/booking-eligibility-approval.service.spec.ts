import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DEFAULT_ORGANIZATION_ROLE_TEMPLATES } from '@modules/users/defaults/organization-role.defaults';
import { normalizeMembershipPermissions } from '@shared/auth/permission.util';
import { BookingEligibilityApprovalService } from './booking-eligibility-approval.service';
import { testGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';

describe('BookingEligibilityApprovalService', () => {
  const organizationId = 'org-1';
  const bookingId = 'booking-1';
  const requesterId = 'user-requester';
  const approverId = 'user-approver';

  let prisma: {
    booking: { findFirst: jest.Mock };
    bookingAllowedDriver: { count: jest.Mock };
    bookingDeposit: { findFirst: jest.Mock };
    bookingEligibilityApproval: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
    organizationMembership: { findFirst: jest.Mock };
  };
  let gatekeeper: { evaluate: jest.Mock };
  let service: BookingEligibilityApprovalService;

  const booking = {
    id: bookingId,
    status: 'PENDING',
    customerId: 'customer-1',
    vehicleId: 'vehicle-1',
    startDate: new Date('2026-08-01T10:00:00.000Z'),
    endDate: new Date('2026-08-03T10:00:00.000Z'),
    paymentIntent: 'pay_on_pickup',
    extrasJson: null,
  };

  beforeEach(() => {
    prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue(booking) },
      bookingAllowedDriver: { count: jest.fn().mockResolvedValue(0) },
      bookingDeposit: { findFirst: jest.fn().mockResolvedValue(null) },
      bookingEligibilityApproval: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma)),
      organizationMembership: { findFirst: jest.fn() },
    };
    gatekeeper = {
      evaluate: jest.fn().mockResolvedValue(
        testGateResult({ status: 'MANUAL_APPROVAL_REQUIRED', reasonCodes: ['RENTAL_MANUAL_APPROVAL_REQUIRED'] }),
      ),
    };
    service = new BookingEligibilityApprovalService(prisma as never, gatekeeper as never);
  });

  it('creates a pending approval when gatekeeper requires manual approval', async () => {
    const createdAt = new Date('2026-07-23T12:00:00.000Z');
    prisma.bookingEligibilityApproval.create.mockResolvedValue({
      id: 'approval-1',
      organizationId,
      bookingId,
      eligibilityDecision: 'MANUAL_APPROVAL_REQUIRED',
      exceptionReason: 'Station manager exception for foreign travel',
      reasonCodes: ['RENTAL_MANUAL_APPROVAL_REQUIRED'],
      status: 'PENDING',
      gateStage: 'CONFIRM',
      targetBookingStatus: 'CONFIRMED',
      requestedByUserId: requesterId,
      decidedByUserId: null,
      decisionReason: null,
      eligibilityFingerprint: 'fp-1',
      ruleRevision: 'rev-1',
      bookingDataVersion: 'data-1',
      gateResultSnapshot: {},
      createdAt,
      decidedAt: null,
      expiresAt: new Date('2026-07-30T12:00:00.000Z'),
    });

    const result = await service.createRequest({
      organizationId,
      bookingId,
      requestedByUserId: requesterId,
      exceptionReason: 'Station manager exception for foreign travel',
    });

    expect(result.status).toBe('PENDING');
    expect(result.exceptionReason).toContain('foreign travel');
    expect(prisma.bookingEligibilityApproval.create).toHaveBeenCalled();
  });

  it('rejects approval creation when gate is not manual approval', async () => {
    gatekeeper.evaluate.mockResolvedValue(testGateResult({ status: 'ELIGIBLE' }));

    await expect(
      service.createRequest({
        organizationId,
        bookingId,
        requestedByUserId: requesterId,
        exceptionReason: 'Should not be allowed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks self-approval', async () => {
    prisma.bookingEligibilityApproval.findFirst.mockResolvedValue({
      id: 'approval-1',
      organizationId,
      bookingId,
      status: 'PENDING',
      requestedByUserId: requesterId,
      targetBookingStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.decide({
        organizationId,
        bookingId,
        approvalId: 'approval-1',
        decidedByUserId: requesterId,
        decision: 'APPROVE',
        decisionReason: 'Self approval attempt',
        membershipRole: 'ORG_ADMIN',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('approves with override permission by a different user', async () => {
    const disposition = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find(
      (template) => template.systemKey === 'disposition',
    )!;
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(disposition.permissions),
    });
    prisma.bookingEligibilityApproval.findFirst.mockResolvedValue({
      id: 'approval-1',
      organizationId,
      bookingId,
      status: 'PENDING',
      requestedByUserId: requesterId,
      targetBookingStatus: 'CONFIRMED',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.bookingEligibilityApproval.update.mockResolvedValue({
      id: 'approval-1',
      organizationId,
      bookingId,
      eligibilityDecision: 'MANUAL_APPROVAL_REQUIRED',
      exceptionReason: 'Exception',
      reasonCodes: [],
      status: 'APPROVED',
      gateStage: 'CONFIRM',
      targetBookingStatus: 'CONFIRMED',
      requestedByUserId: requesterId,
      decidedByUserId: approverId,
      decisionReason: 'Approved by station lead',
      eligibilityFingerprint: 'fp',
      ruleRevision: 'rev',
      bookingDataVersion: 'data',
      gateResultSnapshot: null,
      createdAt: new Date(),
      decidedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.decide({
      organizationId,
      bookingId,
      approvalId: 'approval-1',
      decidedByUserId: approverId,
      decision: 'APPROVE',
      decisionReason: 'Approved by station lead',
      membershipRole: 'ORG_ADMIN',
    });

    expect(result.status).toBe('APPROVED');
    expect(result.decidedByUserId).toBe(approverId);
  });

  it('revokes active approvals on booking mutation', async () => {
    prisma.bookingEligibilityApproval.updateMany.mockResolvedValue({ count: 2 });

    const count = await service.revokeActiveApprovals({
      organizationId,
      bookingId,
      reason: 'Vehicle changed',
      invalidationFacts: ['vehicle', 'rule_revision'],
    });

    expect(count).toBe(2);
    expect(prisma.bookingEligibilityApproval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['PENDING', 'APPROVED'] },
        }),
        data: expect.objectContaining({ status: 'REVOKED' }),
      }),
    );
  });

  it('throws when approval is missing for transition validation', async () => {
    prisma.bookingEligibilityApproval.findFirst.mockResolvedValue(null);
    const gateResult = testGateResult({ status: 'MANUAL_APPROVAL_REQUIRED' });

    await expect(
      service.assertValidForTransition({
        organizationId,
        bookingId,
        approvalId: 'missing',
        gateResult,
        bookingContext: {
          organizationId,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          startDate: booking.startDate,
          endDate: booking.endDate,
          targetStatus: 'CONFIRMED',
        },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws not found when deciding unknown approval', async () => {
    const disposition = DEFAULT_ORGANIZATION_ROLE_TEMPLATES.find(
      (template) => template.systemKey === 'disposition',
    )!;
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'SUB_ADMIN',
      permissions: normalizeMembershipPermissions(disposition.permissions),
    });
    prisma.bookingEligibilityApproval.findFirst.mockResolvedValue(null);

    await expect(
      service.decide({
        organizationId,
        bookingId,
        approvalId: 'missing',
        decidedByUserId: approverId,
        decision: 'REJECT',
        decisionReason: 'Not found',
        membershipRole: 'SUB_ADMIN',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
