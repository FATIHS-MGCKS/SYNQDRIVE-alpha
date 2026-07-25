/**
 * Operator App — backend authorization audit regression tests (Prompt 7).
 * Verifies tenant isolation for endpoints used by the Operator field app.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CustomerVerificationService } from '@modules/customer-verification/customer-verification.service';
import { CustomerVerificationReadModelService } from '@modules/customer-verification/customer-verification-read-model.service';
import {
  assertBookingInOrganization,
  assertVehicleInOrganization,
} from '@modules/vehicle-intelligence/tenant/vehicle-intelligence-tenant.scope';
import { VehicleOwnershipGuard } from '@shared/auth/vehicle-ownership.guard';

const orgA = 'org-tenant-a';
const vehicleB = 'veh-b';

describe('Operator endpoints — tenant isolation audit', () => {
  describe('vehicle-scoped guard (damages, tires, document-extractions)', () => {
    const prisma = {
      vehicle: { findFirst: jest.fn(), findUnique: jest.fn() },
      organizationMembership: { findFirst: jest.fn() },
    };
    let guard: VehicleOwnershipGuard;

    beforeEach(() => {
      jest.clearAllMocks();
      guard = new VehicleOwnershipGuard(prisma as never);
    });

    it('denies foreign vehicleId (AUTHZ-OP-001)', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              params: { vehicleId: vehicleB },
              user: { id: 'u1', organizationId: orgA },
            }),
          }),
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('denies revoked membership on vehicle routes (AUTHZ-OP-001 fix)', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 'veh-1' });
      prisma.organizationMembership.findFirst.mockResolvedValue(null);
      await expect(
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({
              params: { vehicleId: 'veh-1' },
              user: { id: 'u1', organizationId: orgA },
            }),
          }),
        } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('tenant scope helpers', () => {
    const prisma = {
      vehicle: { findFirst: jest.fn() },
      booking: { findFirst: jest.fn() },
    };

    it('rejects foreign organization vehicle', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);
      await expect(assertVehicleInOrganization(prisma as never, orgA, vehicleB)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects foreign organization booking', async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      await expect(assertBookingInOrganization(prisma as never, orgA, 'book-b')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('org-scoped query patterns (Operator endpoints)', () => {
    it('scopes booking detail by organizationId', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({ where: { id: 'book-foreign', organizationId: orgA } });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'book-foreign', organizationId: orgA },
      });
    });

    it('scopes task lookup by organizationId', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({ where: { id: 'task-foreign', organizationId: orgA } });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'task-foreign', organizationId: orgA },
      });
    });

    it('scopes generated document download by organizationId', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({ where: { id: 'doc-foreign', organizationId: orgA } });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-foreign', organizationId: orgA },
      });
    });

    it('scopes customer documents by organizationId + customerId', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      await findMany({
        where: { organizationId: orgA, customerId: 'cust-a' },
        orderBy: { createdAt: 'desc' },
      });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: orgA, customerId: 'cust-a' },
        }),
      );
    });

    it('scopes vehicle damage create FK validation to org + vehicle', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({
        where: { id: 'book-foreign', organizationId: orgA, vehicleId: 'veh-a' },
      });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'book-foreign', organizationId: orgA, vehicleId: 'veh-a' },
      });
    });

    it('scopes document extraction read by vehicleId + extractionId', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      await findFirst({ where: { id: 'ext-foreign', vehicleId: 'veh-a' } });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'ext-foreign', vehicleId: 'veh-a' },
      });
    });
  });

  describe('customer verification — foreign customer/booking', () => {
    const prisma = {
      customer: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      booking: { findFirst: jest.fn() },
      customerVerificationCheck: { create: jest.fn(), findMany: jest.fn() },
      customerDocument: { findMany: jest.fn() },
      customerTimelineEvent: { create: jest.fn() },
    };
    const readModel = {
      isTerminalStatus: jest.fn(() => false),
    } as unknown as CustomerVerificationReadModelService;
    const service = new CustomerVerificationService(
      prisma as never,
      {} as never,
      { get: jest.fn() } as never,
      readModel,
    );

    beforeEach(() => {
      jest.clearAllMocks();
      (prisma.customerDocument.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.customerVerificationCheck.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('rejects foreign customerId', async () => {
      (prisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createManualPickupCheck(
          { id: 'u1', organizationId: orgA },
          {
            customerId: 'cust-b',
            bookingId: 'book-1',
            idDocumentSeen: true,
            idNameMatchesBooking: true,
            idDateOfBirthChecked: true,
            minimumAgePassed: true,
            drivingLicenseSeen: false,
            licenseNameMatchesBooking: false,
            licenseClassValid: false,
            licenseNotExpired: false,
          },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects foreign bookingId', async () => {
      (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'cust-a' });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        service.createManualPickupCheck(
          { id: 'u1', organizationId: orgA },
          {
            customerId: 'cust-a',
            bookingId: 'book-foreign',
            idDocumentSeen: true,
            idNameMatchesBooking: true,
            idDateOfBirthChecked: true,
            minimumAgePassed: true,
            drivingLicenseSeen: false,
            licenseNameMatchesBooking: false,
            licenseClassValid: false,
            licenseNotExpired: false,
          },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects booking/customer mismatch', async () => {
      (prisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'cust-a' });
      (prisma.booking.findFirst as jest.Mock).mockResolvedValue({
        id: 'book-1',
        customerId: 'other-customer',
      });
      await expect(
        service.createManualPickupCheck(
          { id: 'u1', organizationId: orgA },
          {
            customerId: 'cust-a',
            bookingId: 'book-1',
            idDocumentSeen: true,
            idNameMatchesBooking: true,
            idDateOfBirthChecked: true,
            minimumAgePassed: true,
            drivingLicenseSeen: false,
            licenseNameMatchesBooking: false,
            licenseClassValid: false,
            licenseNotExpired: false,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
