import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { OrgScopingGuard } from '@shared/auth/org-scoping.guard';
import { BOOKING_PERMISSION_REQUIREMENTS } from './booking-permission.constants';
import {
  bookingDispositionPermissions,
  bookingDriverPermissions,
  bookingFullPermissions,
  bookingNoAccessPermissions,
  bookingWorkerReadPermissions,
} from './booking-permission.defaults';
import { BookingAccessService } from './booking-access.service';
import { BookingPermissionsGuard } from './guards/booking-permissions.guard';
import { assertBookingUpdatePermissions } from './booking-update-permission.util';
import { BookingResponseRedactionService } from './booking-response-redaction.service';
import type { BookingDetailDto } from './booking-detail.types';

describe('BookingPermissionsGuard enforcement', () => {
  const orgId = 'org-a';
  const otherOrgId = 'org-b';
  const userId = 'user-1';

  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma = {
    organizationMembership: { findFirst: jest.fn() },
  };

  let guard: BookingPermissionsGuard;
  let orgScopingGuard: OrgScopingGuard;

  function context(
    user: Record<string, unknown> | undefined,
    action: keyof typeof BOOKING_PERMISSION_REQUIREMENTS = 'booking.read',
    routeOrgId = orgId,
  ) {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(action);
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { orgId: routeOrgId },
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
  }

  beforeEach(() => {
    guard = new BookingPermissionsGuard(reflector, prisma as never);
    orgScopingGuard = new OrgScopingGuard(prisma as never);
    jest.clearAllMocks();
  });

  it('denies handler without booking permission metadata (403)', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId, organizationId: orgId },
          params: { orgId },
          query: {},
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(ctx as never)).rejects.toMatchObject({
      response: {
        message: 'Booking endpoint requires an explicit booking permission declaration',
        statusCode: 403,
      },
    });
  });

  it('allows ORG_ADMIN without module permission lookup', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'ORG_ADMIN',
      permissions: bookingNoAccessPermissions(),
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.create') as never),
    ).resolves.toBe(true);
  });

  it('allows worker with bookings.read for list', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: bookingWorkerReadPermissions(),
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.read') as never),
    ).resolves.toBe(true);
  });

  it('denies worker without bookings.read (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: bookingNoAccessPermissions(),
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.read') as never),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: bookings.read', statusCode: 403 },
    });
  });

  it('denies worker with read-only for booking.create mutation (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: bookingWorkerReadPermissions(),
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.create') as never),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: bookings.write', statusCode: 403 },
    });
  });

  it('allows disposition worker with bookings.write for create', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: bookingDispositionPermissions(),
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.create') as never),
    ).resolves.toBe(true);
  });

  it('allows driver with bookings.read for read endpoints', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'DRIVER',
      permissions: bookingDriverPermissions(),
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.read') as never),
    ).resolves.toBe(true);
  });

  it('denies driver without bookings-sensitive for allowed-drivers (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'DRIVER',
      permissions: bookingDriverPermissions(),
    });
    await expect(
      guard.canActivate(
        context({ id: userId, organizationId: orgId }, 'booking.read_sensitive') as never,
      ),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: bookings-sensitive.read', statusCode: 403 },
    });
  });

  it('denies active member without any booking permission (403)', async () => {
    prisma.organizationMembership.findFirst.mockResolvedValue({
      role: 'WORKER',
      permissions: { dashboard: { read: true, write: false } },
    });
    await expect(
      guard.canActivate(context({ id: userId, organizationId: orgId }, 'booking.read') as never),
    ).rejects.toMatchObject({
      response: { message: 'Missing permission: bookings.read', statusCode: 403 },
    });
  });

  it('allows MASTER_ADMIN without membership lookup', async () => {
    await expect(
      guard.canActivate(
        context({ id: userId, platformRole: 'MASTER_ADMIN' }, 'booking.create', otherOrgId) as never,
      ),
    ).resolves.toBe(true);
    expect(prisma.organizationMembership.findFirst).not.toHaveBeenCalled();
  });

  it('denies cross-tenant org access via OrgScopingGuard (403)', async () => {
    await expect(
      orgScopingGuard.canActivate(
        {
          switchToHttp: () => ({
            getRequest: () => ({
              user: { id: userId, organizationId: orgId },
              params: { orgId: otherOrgId },
            }),
          }),
          getHandler: () => ({}),
          getClass: () => ({}),
        } as never,
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'You do not have access to this organization',
        statusCode: 403,
      },
    });
  });
});

describe('BookingAccessService IDOR prevention', () => {
  const orgId = 'org-a';
  const bookingId = 'booking-1';
  const customerId = 'cust-1';

  const prisma = {
    booking: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    customer: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    station: { findFirst: jest.fn() },
  };

  let service: BookingAccessService;

  beforeEach(() => {
    service = new BookingAccessService(prisma as never);
    jest.clearAllMocks();
  });

  it('returns booking when orgId and bookingId match', async () => {
    prisma.booking.findFirst.mockResolvedValue({
      id: bookingId,
      customerId,
      assignedDriverId: null,
      vehicleId: 'veh-1',
    });
    const row = await service.assertBookingInOrg(orgId, bookingId);
    expect(row.id).toBe(bookingId);
    expect(prisma.booking.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: bookingId, organizationId: orgId },
      }),
    );
  });

  it('throws 404 when booking not in org (no existence leak)', async () => {
    prisma.booking.findFirst.mockResolvedValue(null);
    await expect(service.assertBookingInOrg(orgId, bookingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws 404 when driver accesses booking outside scope', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'driver@example.com' });
    prisma.customer.findFirst.mockResolvedValue({ id: 'cust-driver' });
    prisma.booking.findFirst.mockResolvedValue(null);

    await expect(
      service.assertDriverScopedBookingAccess({
        orgId,
        bookingId,
        userId: 'user-driver',
        membershipRole: MembershipRole.DRIVER,
        permissions: bookingDriverPermissions(),
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows driver with sensitive read to access any booking in org', async () => {
    await expect(
      service.assertDriverScopedBookingAccess({
        orgId,
        bookingId,
        userId: 'user-driver',
        membershipRole: MembershipRole.DRIVER,
        permissions: bookingFullPermissions(),
      }),
    ).resolves.toBeUndefined();
    expect(prisma.booking.findFirst).not.toHaveBeenCalled();
  });

  it('throws 404 for foreign customer on secondary resource check', async () => {
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(
      service.assertSecondaryResourceInOrg(orgId, { customerId: 'foreign-cust' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('Booking update field-level permissions', () => {
  it('requires schedule permission when changing dates', () => {
    expect(() =>
      assertBookingUpdatePermissions(
        { startDate: '2026-08-01' },
        bookingDispositionPermissions(),
      ),
    ).not.toThrow();
  });

  it('denies schedule change without bookings-schedule.write', () => {
    expect(() =>
      assertBookingUpdatePermissions({ endDate: '2026-08-05' }, bookingWorkerReadPermissions()),
    ).toThrow(ForbiddenException);
  });

  it('requires customer permission when changing customerId', () => {
    expect(() =>
      assertBookingUpdatePermissions(
        { customerId: 'cust-2' },
        bookingDispositionPermissions(),
      ),
    ).not.toThrow();
  });

  it('requires confirm permission when setting status CONFIRMED', () => {
    expect(() =>
      assertBookingUpdatePermissions(
        { status: 'CONFIRMED' },
        bookingDispositionPermissions(),
      ),
    ).not.toThrow();
  });
});

describe('BookingResponseRedactionService', () => {
  const redaction = new BookingResponseRedactionService();

  const baseDetail = {
    customer: {
      customerId: 'c1',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      phone: '+49123',
      customerStatus: 'ACTIVE',
      identityStatus: 'VERIFIED',
      licenseStatus: 'VALID',
      riskLevel: 'LOW',
      openInvoiceCount: 1,
      openFineCount: 0,
      noShowCount: 0,
    },
    core: { notes: 'secret' },
    finance: {
      basePriceCents: 10000,
      extrasPriceCents: 0,
      discountAmountCents: 0,
      depositAmountCents: 50000,
      depositStatus: 'HELD',
      taxRate: 19,
      taxAmountCents: 1900,
      grossAmountCents: 11900,
      paidAmountCents: 0,
      openAmountCents: 11900,
      paymentStatus: 'OPEN',
      invoiceStatus: 'DRAFT',
      finalInvoiceStatus: null,
      additionalChargesCents: 0,
      refundAmountCents: 0,
      retainedDepositAmountCents: 0,
      computed: true,
    },
    payments: [{ id: 'p1' }],
    documents: {
      bundleStatus: 'COMPLETE',
      completenessStatus: 'OK',
      legalTermsAttached: true,
      legalWithdrawalAttached: true,
      legalPrivacyAttached: true,
      legalMissing: [],
      warnings: [],
      slots: [],
    },
    handover: {
      pickup: {
        id: 'h1',
        customerSignatureDataUrl: 'data:image/png;base64,abc',
        staffSignatureDataUrl: 'data:image/png;base64,def',
        customerSignatureName: 'Jane',
        staffSignatureName: 'Staff',
      },
      return: null,
    },
    activity: [{ id: 'a1', action: 'CREATED' }],
  } as unknown as BookingDetailDto;

  it('redacts finance for worker without bookings-finance.read', () => {
    const result = redaction.redactDetail(baseDetail, bookingWorkerReadPermissions());
    expect(result.finance.grossAmountCents).toBeNull();
    expect(result.payments).toBeNull();
  });

  it('redacts sensitive PII for worker without bookings-sensitive.read', () => {
    const result = redaction.redactDetail(baseDetail, bookingWorkerReadPermissions());
    expect(result.customer.fullName).toBe('—');
    expect(result.customer.email).toBeNull();
    expect(result.core.notes).toBeNull();
  });

  it('redacts audit activity without bookings-audit.read', () => {
    const result = redaction.redactDetail(baseDetail, bookingDispositionPermissions());
    expect(result.activity).toEqual([]);
  });

  it('preserves finance for full permissions', () => {
    const result = redaction.redactDetail(baseDetail, bookingFullPermissions());
    expect(result.finance.grossAmountCents).toBe(11900);
    expect(result.payments).toEqual([{ id: 'p1' }]);
  });
});
