import { BadRequestException } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleRawStatusWriteService } from './vehicle-raw-status-write.service';

describe('VehicleRawStatusWriteService', () => {
  let service: VehicleRawStatusWriteService;
  let prisma: {
    vehicle: {
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let audit: { record: jest.Mock };

  const baseCtx = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    actorUserId: 'user-1',
  };

  beforeEach(() => {
    prisma = {
      vehicle: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    audit = { record: jest.fn().mockResolvedValue('audit-1') };
    service = new VehicleRawStatusWriteService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
    );
  });

  describe('domain guards', () => {
    it('rejects RESERVED for admin manual writes', async () => {
      await expect(
        service.applyAdminOperationalStatus({
          ...baseCtx,
          status: VehicleStatus.RESERVED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.vehicle.update).not.toHaveBeenCalled();
    });

    it('rejects RENTED for admin manual writes', async () => {
      await expect(
        service.applyAdminOperationalStatus({
          ...baseCtx,
          status: VehicleStatus.RENTED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects RESERVED for workflow writes', async () => {
      await expect(
        service.applyWorkflowMaintenanceStatus({
          ...baseCtx,
          status: VehicleStatus.RESERVED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects RENTED for workflow writes', async () => {
      await expect(
        service.applyWorkflowMaintenanceStatus({
          ...baseCtx,
          status: VehicleStatus.RENTED,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('applyAdminOperationalStatus', () => {
    it('writes IN_SERVICE and records audit', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.AVAILABLE,
      });
      prisma.vehicle.update.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.IN_SERVICE,
      });

      const result = await service.applyAdminOperationalStatus({
        ...baseCtx,
        status: VehicleStatus.IN_SERVICE,
      });

      expect(result.changed).toBe(true);
      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'veh-1' },
        data: { status: VehicleStatus.IN_SERVICE },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: 'veh-1',
          description: expect.stringContaining('ADMIN_MANUAL'),
          metaJson: expect.objectContaining({
            domain: 'ADMIN_MANUAL',
            previousStatus: VehicleStatus.AVAILABLE,
            nextStatus: VehicleStatus.IN_SERVICE,
          }),
        }),
      );
    });
  });

  describe('applyHandoverPickup', () => {
    it('writes compatibility RENTED on pickup', async () => {
      const tx = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            status: VehicleStatus.AVAILABLE,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'veh-1',
            status: VehicleStatus.RENTED,
          }),
        },
      };

      const result = await service.applyHandoverPickup(
        { ...baseCtx, bookingId: 'bk-1', currentStationId: 'st-1' },
        tx as any,
      );

      expect(result.nextStatus).toBe(VehicleStatus.RENTED);
      expect(tx.vehicle.update).toHaveBeenCalledWith({
        where: { id: 'veh-1' },
        data: {
          status: VehicleStatus.RENTED,
          currentStation: { connect: { id: 'st-1' } },
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metaJson: expect.objectContaining({
            domain: 'BOOKING_HANDOVER',
            handoverKind: 'PICKUP',
            bookingId: 'bk-1',
          }),
        }),
      );
    });
  });

  describe('applyHandoverReturn', () => {
    it('writes AVAILABLE when not blocked and no other active booking', async () => {
      const tx = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-1',
            status: VehicleStatus.RENTED,
          }),
          update: jest.fn().mockResolvedValue({
            id: 'veh-1',
            status: VehicleStatus.AVAILABLE,
          }),
        },
      };

      const result = await service.applyHandoverReturn(
        {
          ...baseCtx,
          bookingId: 'bk-1',
          blockedByMaintenance: false,
          otherActiveBookings: 0,
        },
        tx as any,
      );

      expect(result?.nextStatus).toBe(VehicleStatus.AVAILABLE);
      expect(audit.record).toHaveBeenCalled();
    });

    it('skips status flip when maintenance-blocked', async () => {
      const result = await service.applyHandoverReturn(
        {
          ...baseCtx,
          bookingId: 'bk-1',
          blockedByMaintenance: true,
          otherActiveBookings: 0,
        },
        {
          vehicle: {
            findFirst: jest.fn(),
            update: jest.fn(),
          },
        } as any,
      );

      expect(result).toBeNull();
    });
  });

  describe('applyBookingLifecycleRelease', () => {
    it('releases vehicle on cancel when not maintenance-blocked', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.RENTED,
      });
      prisma.vehicle.updateMany.mockResolvedValue({ count: 1 });

      const count = await service.applyBookingLifecycleRelease({
        ...baseCtx,
        bookingId: 'bk-1',
        reason: 'CANCEL',
      });

      expect(count).toBe(1);
      expect(prisma.vehicle.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'veh-1',
          organizationId: 'org-1',
          status: {
            notIn: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE],
          },
        },
        data: { status: VehicleStatus.AVAILABLE },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metaJson: expect.objectContaining({
            domain: 'BOOKING_LIFECYCLE',
            lifecycleReason: 'CANCEL',
          }),
        }),
      );
    });

    it('does not audit when maintenance blocks release', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.IN_SERVICE,
      });
      prisma.vehicle.updateMany.mockResolvedValue({ count: 0 });

      const count = await service.applyBookingLifecycleRelease({
        ...baseCtx,
        bookingId: 'bk-1',
        reason: 'NO_SHOW',
      });

      expect(count).toBe(0);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('applyWorkflowMaintenanceStatus', () => {
    it('writes OUT_OF_SERVICE for workflow domain', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.AVAILABLE,
      });
      prisma.vehicle.update.mockResolvedValue({
        id: 'veh-1',
        status: VehicleStatus.OUT_OF_SERVICE,
      });

      await service.applyWorkflowMaintenanceStatus({
        ...baseCtx,
        status: VehicleStatus.OUT_OF_SERVICE,
      });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          metaJson: expect.objectContaining({ domain: 'WORKFLOW_MAINTENANCE' }),
        }),
      );
    });
  });
});
