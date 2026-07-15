/**
 * Task Domain V2 — Linked objects (F)
 */
import { BadRequestException } from '@nestjs/common';
import { TaskLinkedObjectResolverService } from '../task-linked-object-resolver.service';
import { TaskLinkedObjectActionType } from '../task-linked-object.types';
import { baseTask, createTasksServiceHarness } from '../__fixtures__/tasks-service.fixtures';

describe('Task Domain V2 — Linked objects (F)', () => {
  describe('resolver — supported types', () => {
    let prisma: ReturnType<typeof makePrisma>;
    let resolver: TaskLinkedObjectResolverService;

    function makePrisma() {
      return {
        vehicle: { findMany: jest.fn().mockResolvedValue([]) },
        booking: { findMany: jest.fn().mockResolvedValue([]) },
        customer: { findMany: jest.fn().mockResolvedValue([]) },
        orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
        vehicleDocumentExtraction: { findMany: jest.fn().mockResolvedValue([]) },
        dashboardInsight: { findMany: jest.fn().mockResolvedValue([]) },
        serviceCase: { findMany: jest.fn().mockResolvedValue([]) },
        fine: { findMany: jest.fn().mockResolvedValue([]) },
        vendor: { findMany: jest.fn().mockResolvedValue([]) },
      };
    }

    beforeEach(() => {
      prisma = makePrisma();
      resolver = new TaskLinkedObjectResolverService(prisma as any);
    });

    it('resolves all supported link types in stable order', async () => {
      prisma.customer.findMany.mockResolvedValue([
        { id: 'c1', firstName: 'A', lastName: 'B', company: null, email: null, phone: null },
      ]);
      prisma.serviceCase.findMany.mockResolvedValue([
        { id: 'sc1', title: 'Case', category: 'TUV_HU', status: 'OPEN' },
      ]);
      prisma.orgInvoice.findMany.mockResolvedValue([
        {
          id: 'i1',
          title: 'R',
          status: 'ISSUED',
          totalCents: 100,
          currency: 'EUR',
          invoiceNumberDisplay: '2026-1',
          legacyInvoiceNumber: null,
          invoiceNumber: null,
          sequenceYear: null,
          sequenceNumber: null,
        },
      ]);
      prisma.vehicleDocumentExtraction.findMany.mockResolvedValue([
        { id: 'd1', effectiveDocumentType: 'TUV_REPORT', documentType: 'TUV_REPORT', status: 'COMPLETED', sourceFileName: 'tuv.pdf' },
      ]);
      prisma.fine.findMany.mockResolvedValue([
        { id: 'f1', title: 'Fine', fineNumber: 'F-1', status: 'NEW', amountCents: 100, currency: 'EUR' },
      ]);
      prisma.vendor.findMany.mockResolvedValue([
        { id: 'v1', name: 'Vendor', category: 'WORKSHOP', isActive: true, city: 'Berlin' },
      ]);
      prisma.dashboardInsight.findMany.mockResolvedValue([
        { id: 'a1', title: 'Alert', isActive: true, severity: 'WARNING', type: 'SERVICE_OVERDUE' },
      ]);

      const linked = await resolver.resolveForTask('org1', {
        customerId: 'c1',
        serviceCaseId: 'sc1',
        invoiceId: 'i1',
        documentId: 'd1',
        fineId: 'f1',
        vendorId: 'v1',
        alertId: 'a1',
      });

      expect(linked.map((o) => o.type)).toEqual([
        'CUSTOMER',
        'SERVICE_CASE',
        'INVOICE',
        'DOCUMENT',
        'FINE',
        'VENDOR',
        'ALERT',
      ]);
    });

    it('marks deleted entities unavailable without throwing', async () => {
      const [vehicle] = await resolver.resolveForTask('org1', { vehicleId: 'veh-gone' });
      expect(vehicle.isAvailable).toBe(false);
      expect(vehicle.unavailableReason).toBeTruthy();
      expect(vehicle.action).toEqual({
        type: TaskLinkedObjectActionType.OPEN_VEHICLE,
        vehicleId: 'veh-gone',
      });
    });

    it('scopes vehicle queries to organizationId', async () => {
      await resolver.resolveForTask('org-tenant-a', { vehicleId: 'veh-1' });
      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-tenant-a', id: { in: ['veh-1'] } },
        }),
      );
    });
  });

  describe('service — tenant isolation on link validation', () => {
    it('rejects manual task creation when vehicle belongs to another org', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(
        svc.createManualTask('org1', { title: 'X', type: 'CUSTOM', vehicleId: 'veh-other' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.orgTask.create).not.toHaveBeenCalled();
    });

    it('rejects document link from foreign org', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.vehicleDocumentExtraction.findUnique.mockResolvedValue({
        organizationId: 'org-other',
      });

      await expect(
        svc.createManualTask('org1', { title: 'X', type: 'CUSTOM', documentId: 'doc-foreign' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('loadTaskOrThrow does not return tasks from other orgs', async () => {
      const { svc, prisma } = createTasksServiceHarness();
      prisma.orgTask.findFirst.mockResolvedValue(null);

      await expect(svc.getTaskById('t1', 'org1')).rejects.toThrow('Task not found');
    });
  });
});
