import { NotFoundException } from '@nestjs/common';
import { BookingEligibilityDecisionService } from './booking-eligibility-decision.service';
import { testGateResult } from '../booking-eligibility-gatekeeper/booking-eligibility-test.fixtures';

describe('BookingEligibilityDecisionService', () => {
  const organizationId = 'org-1';
  const bookingId = 'booking-1';

  let prisma: {
    booking: { findFirst: jest.Mock };
    bookingEligibilityDecision: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    rentalRuleRevision: { findFirst: jest.Mock };
  };
  let service: BookingEligibilityDecisionService;

  const gateResult = (() => {
    const base = testGateResult({
      status: 'NOT_ELIGIBLE',
      stage: 'CONFIRM',
      allowed: false,
      organizationId,
      bookingId,
      vehicleId: 'vehicle-1',
    });
    return testGateResult({
      ...base,
      domains: {
        ...base.domains,
        rentalRules: {
          evaluated: true,
          result: {
            status: 'NOT_ELIGIBLE',
            blockingReasons: ['Too young'],
            warningReasons: [],
            missingFields: [],
            manualApprovalReasons: [],
            effectiveRules: {
              organizationId,
              vehicleId: 'vehicle-1',
              rentalCategoryId: 'cat-1',
            } as never,
            decisionSource: 'RENTAL_RULES_EFFECTIVE',
            facts: [],
            customerId: 'customer-1',
            vehicleId: 'vehicle-1',
            bookingId,
          },
        },
      },
    });
  })();

  beforeEach(() => {
    prisma = {
      booking: { findFirst: jest.fn().mockResolvedValue({ id: bookingId }) },
      bookingEligibilityDecision: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      rentalRuleRevision: { findFirst: jest.fn() },
    };

    prisma.rentalRuleRevision.findFirst.mockImplementation(async (args: {
      where: { scopeType: string };
    }) => {
      if (args.where.scopeType === 'ORGANIZATION') {
        return { id: 'rev-org', rulesHash: 'hash-org', version: 1 };
      }
      if (args.where.scopeType === 'CATEGORY') {
        return { id: 'rev-cat', rulesHash: 'hash-cat', version: 2 };
      }
      return null;
    });

    service = new BookingEligibilityDecisionService(prisma as never);
  });

  it('appends immutable decision snapshots without update support', async () => {
    const createdAt = new Date('2026-07-23T10:00:00.000Z');
    prisma.bookingEligibilityDecision.create.mockResolvedValue({
      id: 'decision-1',
      organizationId,
      bookingId,
      eventType: 'CONFIRM_REJECTED',
      decisionStatus: 'NOT_ELIGIBLE',
      reasonCodes: gateResult.reasonCodes,
      blockingReasons: [],
      warnings: [],
      missingFields: [],
      evaluatedAt: new Date(gateResult.evaluatedAt),
      recheckAt: null,
      engineVersion: gateResult.engineVersion,
      ruleRevisionIds: ['rev-org', 'rev-cat'],
      rulesHash: 'combined-hash',
      derivedFacts: {},
      dataSources: {},
      manualApprovalId: null,
      bookingDataVersion: 'data-version',
      correlationId: gateResult.correlation.auditEventId,
      evaluationId: gateResult.correlation.evaluationId,
      createdAt,
    });

    const row = await service.appendFromGateResult({
      organizationId,
      bookingId,
      eventType: 'CONFIRM_REJECTED',
      gateResult,
      bookingDataContext: {
        customerId: 'customer-1',
        vehicleId: 'vehicle-1',
        startDate: new Date('2026-08-01T10:00:00.000Z'),
        endDate: new Date('2026-08-03T10:00:00.000Z'),
      },
    });

    expect(prisma.bookingEligibilityDecision.create).toHaveBeenCalledTimes(1);
    expect(prisma.bookingEligibilityDecision.update).not.toHaveBeenCalled();
    expect(row.eventType).toBe('CONFIRM_REJECTED');
    expect(row.ruleRevisionIds).toEqual(['rev-org', 'rev-cat']);
  });

  it('lists historical decisions newest first', async () => {
    prisma.bookingEligibilityDecision.findMany.mockResolvedValue([
      {
        id: 'decision-2',
        organizationId,
        bookingId,
        eventType: 'CONFIRM_SUCCEEDED',
        decisionStatus: 'ELIGIBLE',
        reasonCodes: [],
        blockingReasons: [],
        warnings: [],
        missingFields: [],
        evaluatedAt: new Date('2026-07-23T11:00:00.000Z'),
        recheckAt: null,
        engineVersion: '1.0.0',
        ruleRevisionIds: ['rev-org'],
        rulesHash: 'hash',
        derivedFacts: {},
        dataSources: {},
        manualApprovalId: null,
        bookingDataVersion: 'v2',
        correlationId: 'corr-2',
        evaluationId: 'eval-2',
        createdAt: new Date('2026-07-23T11:00:00.000Z'),
      },
      {
        id: 'decision-1',
        organizationId,
        bookingId,
        eventType: 'CONFIRM_ATTEMPT',
        decisionStatus: 'ELIGIBLE',
        reasonCodes: [],
        blockingReasons: [],
        warnings: [],
        missingFields: [],
        evaluatedAt: new Date('2026-07-23T10:00:00.000Z'),
        recheckAt: null,
        engineVersion: '1.0.0',
        ruleRevisionIds: ['rev-org'],
        rulesHash: 'hash',
        derivedFacts: {},
        dataSources: {},
        manualApprovalId: null,
        bookingDataVersion: 'v1',
        correlationId: 'corr-1',
        evaluationId: 'eval-1',
        createdAt: new Date('2026-07-23T10:00:00.000Z'),
      },
    ]);

    const rows = await service.listForBooking(organizationId, bookingId);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.id).toBe('decision-2');
    expect(rows[1]?.id).toBe('decision-1');
  });

  it('returns reproducible decision payload by id', async () => {
    prisma.bookingEligibilityDecision.findFirst.mockResolvedValue({
      id: 'decision-1',
      organizationId,
      bookingId,
      eventType: 'PICKUP_CHECK',
      decisionStatus: 'ELIGIBLE',
      reasonCodes: ['RENTAL_ELIGIBLE'],
      blockingReasons: [],
      warnings: [],
      missingFields: [],
      evaluatedAt: new Date('2026-07-23T10:00:00.000Z'),
      recheckAt: null,
      engineVersion: '1.0.0',
      ruleRevisionIds: ['rev-org'],
      rulesHash: 'hash',
      derivedFacts: { allowed: true },
      dataSources: { rentalRules: { evaluated: true } },
      manualApprovalId: null,
      bookingDataVersion: 'v1',
      correlationId: 'corr-1',
      evaluationId: 'eval-1',
      createdAt: new Date('2026-07-23T10:00:00.000Z'),
    });

    const row = await service.getById(organizationId, bookingId, 'decision-1');
    expect(row.engineVersion).toBe('1.0.0');
    expect(row.rulesHash).toBe('hash');
    expect(row.derivedFacts).toEqual({ allowed: true });
  });

  it('throws when decision snapshot is missing', async () => {
    prisma.bookingEligibilityDecision.findFirst.mockResolvedValue(null);
    await expect(service.getById(organizationId, bookingId, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
