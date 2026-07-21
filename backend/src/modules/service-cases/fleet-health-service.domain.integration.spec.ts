/**
 * Fleet Health Service domain-chain integration matrix (in-memory store).
 *
 * Covers finding → task/case, case → tasks, vendor waiting, scheduling fields,
 * blocksRental semantics, lifecycle divergence, vendor partial failure, pagination,
 * permissions, and cross-tenant isolation. No production data.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FHS_PIPELINE_FIXED_NOW } from './__fixtures__/fleet-health-service-pipeline.fixtures';
import { createFleetHealthServicePipelineHarness } from './fleet-health-service-pipeline.harness';

describe('Fleet Health Service domain integration', () => {
  function harness() {
    return createFleetHealthServicePipelineHarness();
  }

  describe('Finding → Task', () => {
    it('converts an active observation into a linked task and marks it CONVERTED', async () => {
      const { store, observations, tasks } = harness();
      const { ids } = store;
      const obs = store.seedObservation(ids.orgA, ids.vehicleA, {
        description: 'Worn wiper blades',
        blocksRental: true,
      });

      const result = await observations.convertToTask(ids.orgA, ids.vehicleA, obs.id as string, {}, ids.operatorA);

      expect(result.taskId).toBeTruthy();
      expect(result.observation.status).toBe('converted');
      const task = await tasks.getTaskById(result.taskId, ids.orgA);
      expect(task.vehicleId).toBe(ids.vehicleA);
      expect(task.blocksVehicleAvailability).toBe(true);
      expect(task.metadata).toEqual(expect.objectContaining({ technicalObservationId: obs.id }));
    });
  });

  describe('Finding → Service Case', () => {
    it('creates a diagnostic service case from an observation via link-service', async () => {
      const { store, observations, serviceCases } = harness();
      const { ids } = store;
      const obs = store.seedObservation(ids.orgA, ids.vehicleA, {
        title: 'Engine noise',
        blocksRental: true,
      });

      const linked = await observations.linkService(ids.orgA, ids.vehicleA, obs.id as string, {
        createServiceCase: true,
        serviceCaseTitle: 'Diagnose Motorgeräusch',
      });

      expect(linked.linkedServiceCaseId).toBeTruthy();
      const serviceCase = await serviceCases.getById(ids.orgA, linked.linkedServiceCaseId!);
      expect(serviceCase.vehicleId).toBe(ids.vehicleA);
      expect(serviceCase.category).toBe('DIAGNOSTIC');
      expect(serviceCase.blocksRental).toBe(true);
      expect(serviceCase.status).toBe('OPEN');
    });
  });

  describe('Case → mehrere Tasks', () => {
    it('links multiple open tasks to the same service case', async () => {
      const { store, tasks, serviceCases } = harness();
      const { ids } = store;

      const serviceCase = await serviceCases.create(ids.orgA, {
        title: 'Bremsen + TÜV',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
      });

      await tasks.createManualTask(
        ids.orgA,
        {
          title: 'Bremsen prüfen',
          category: 'Service',
          type: 'VEHICLE_SERVICE',
          vehicleId: ids.vehicleA,
          serviceCaseId: serviceCase.id,
        },
        ids.operatorA,
      );
      await tasks.createManualTask(
        ids.orgA,
        {
          title: 'TÜV Termin',
          category: 'Service',
          type: 'VEHICLE_INSPECTION',
          vehicleId: ids.vehicleA,
          serviceCaseId: serviceCase.id,
        },
        ids.operatorA,
      );

      const detail = await serviceCases.getById(ids.orgA, serviceCase.id);
      expect(detail.taskCount).toBe(2);
      expect(detail.tasks.map((t) => t.title).sort()).toEqual(['Bremsen prüfen', 'TÜV Termin']);
    });
  });

  describe('Vendor Waiting', () => {
    it('moves a service case to WAITING_VENDOR and a task to WAITING with vendor', async () => {
      const { store, tasks, serviceCases } = harness();
      const { ids } = store;
      store.seedVendor({ id: ids.vendorA, organizationId: ids.orgA, name: 'Werkstatt Nord' });

      const serviceCase = await serviceCases.create(ids.orgA, {
        title: 'Wartung',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
        vendorId: ids.vendorA,
      });

      const waitingCase = await serviceCases.update(ids.orgA, serviceCase.id, {
        status: 'WAITING_VENDOR',
      });
      expect(waitingCase.status).toBe('WAITING_VENDOR');

      const task = await tasks.createManualTask(
        ids.orgA,
        {
          title: 'Ersatzteil',
          category: 'Service',
          vehicleId: ids.vehicleA,
          vendorId: ids.vendorA,
          serviceCaseId: serviceCase.id,
        },
        ids.operatorA,
      );
      const waitingTask = await tasks.moveTaskToWaiting(ids.orgA, task.id, ids.operatorA);
      expect(waitingTask.status).toBe('WAITING');
      expect(waitingTask.vendorId).toBe(ids.vendorA);
    });
  });

  describe('scheduledAt & expectedReadyAt', () => {
    it('creates SCHEDULED cases with schedule and readiness timestamps', async () => {
      const { store, serviceCases } = harness();
      const { ids } = store;

      const scheduledAt = '2026-07-25T08:00:00.000Z';
      const expectedReadyAt = '2026-07-26T16:00:00.000Z';

      const serviceCase = await serviceCases.create(ids.orgA, {
        title: 'Werkstatttermin',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
        scheduledAt,
        expectedReadyAt,
      });

      expect(serviceCase.status).toBe('SCHEDULED');
      expect(serviceCase.scheduledAt).toBe(scheduledAt);
      expect(serviceCase.expectedReadyAt).toBe(expectedReadyAt);
    });
  });

  describe('blocksRental persistence', () => {
    it('persists blocksRental on service cases for downstream rental gating', async () => {
      const { store, serviceCases } = harness();
      const { ids } = store;

      const serviceCase = await serviceCases.create(ids.orgA, {
        title: 'Unfallreparatur',
        category: 'REPAIR',
        vehicleId: ids.vehicleA,
        blocksRental: true,
      });

      const listed = await serviceCases.list(ids.orgA, { vehicleId: ids.vehicleA });
      expect(listed.some((row) => row.id === serviceCase.id && row.blocksRental)).toBe(true);
    });
  });

  describe('Case DONE, Finding aktiv', () => {
    it('allows a completed case while the originating observation stays active', async () => {
      const { store, observations, serviceCases } = harness();
      const { ids } = store;
      const obs = store.seedObservation(ids.orgA, ids.vehicleA, { status: 'ACTIVE' });

      const linked = await observations.linkService(ids.orgA, ids.vehicleA, obs.id as string, {
        createServiceCase: true,
      });
      const serviceCase = await serviceCases.update(ids.orgA, linked.linkedServiceCaseId!, {
        status: 'IN_PROGRESS',
      });
      const completed = await serviceCases.complete(ids.orgA, serviceCase.id, {
        completionNotes: 'Reparatur abgeschlossen',
      });
      const activeList = await observations.list(ids.orgA, ids.vehicleA, { scope: 'active' });

      expect(completed.status).toBe('COMPLETED');
      expect(activeList.active.some((row) => row.id === obs.id)).toBe(true);
    });
  });

  describe('Finding behoben, Case offen', () => {
    it('resolves an observation without auto-closing the linked service case', async () => {
      const { store, observations, serviceCases } = harness();
      const { ids } = store;
      const obs = store.seedObservation(ids.orgA, ids.vehicleA);

      const linked = await observations.linkService(ids.orgA, ids.vehicleA, obs.id as string, {
        createServiceCase: true,
      });
      const resolved = await observations.resolve(ids.orgA, ids.vehicleA, obs.id as string, ids.operatorA);
      const serviceCase = await serviceCases.getById(ids.orgA, linked.linkedServiceCaseId!);

      expect(resolved.status).toBe('resolved');
      expect(resolved.blocksRental).toBe(false);
      expect(serviceCase.status).toBe('OPEN');
    });
  });

  describe('Partial Vendor Failure', () => {
    it('keeps service cases readable when vendor stats fail', async () => {
      const { store, serviceCases, vendors } = harness();
      const { ids } = store;
      store.seedVendor({ id: ids.vendorA, organizationId: ids.orgA, name: 'Werkstatt Nord' });

      await serviceCases.create(ids.orgA, {
        title: 'Wartung',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
        vendorId: ids.vendorA,
      });

      const originalGroupBy = store.prisma.vendor.groupBy;
      store.prisma.vendor.groupBy = jest.fn().mockRejectedValue(new Error('vendor stats unavailable'));

      await expect(vendors.getStats(ids.orgA)).rejects.toThrow('vendor stats unavailable');
      const cases = await serviceCases.list(ids.orgA);
      expect(cases).toHaveLength(1);

      store.prisma.vendor.groupBy = originalGroupBy;
    });
  });

  describe('Pagination & filtering', () => {
    it('scopes case and task lists by vehicle without leaking other vehicles', async () => {
      const { store, tasks, serviceCases } = harness();
      const { ids } = store;

      const caseA = await serviceCases.create(ids.orgA, {
        title: 'Case A',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
      });
      await serviceCases.create(ids.orgA, {
        title: 'Case B',
        category: 'SERVICE',
        vehicleId: ids.vehicleB,
      });

      await tasks.createManualTask(
        ids.orgA,
        {
          title: 'Task A1',
          category: 'Service',
          vehicleId: ids.vehicleA,
          serviceCaseId: caseA.id,
        },
        ids.operatorA,
      );
      await tasks.createManualTask(
        ids.orgA,
        {
          title: 'Task B1',
          category: 'Service',
          vehicleId: ids.vehicleB,
        },
        ids.operatorA,
      );

      const vehicleACases = await serviceCases.listForVehicle(ids.orgA, ids.vehicleA);
      const caseTasks = (await tasks.listTasks(ids.orgA, { serviceCaseId: caseA.id })).data;

      expect(vehicleACases).toHaveLength(1);
      expect(vehicleACases[0]?.id).toBe(caseA.id);
      expect(caseTasks).toHaveLength(1);
      expect(caseTasks[0]?.title).toBe('Task A1');
    });
  });

  describe('Permissions', () => {
    it('rejects task assignment to a user outside the organization', async () => {
      const { store, tasks } = harness();
      const { ids } = store;
      await store.base.prisma.user.create({
        data: {
          id: ids.operatorB,
          name: 'Operator B',
          firstName: 'Operator',
          lastName: 'B',
          email: 'operator-b@test.com',
        },
      });

      await expect(
        tasks.createManualTask(
          ids.orgA,
          {
            title: 'Cross-org assign',
            category: 'Service',
            vehicleId: ids.vehicleA,
            assignedUserId: ids.operatorB,
          },
          ids.operatorA,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Cross-Tenant', () => {
    it('isolates service cases and observations across organizations', async () => {
      const { store, observations, serviceCases } = harness();
      const { ids } = store;

      const serviceCase = await serviceCases.create(ids.orgA, {
        title: 'Org A Case',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
      });
      const obs = store.seedObservation(ids.orgA, ids.vehicleA);

      await expect(serviceCases.getById(ids.orgB, serviceCase.id)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        observations.list(ids.orgB, ids.vehicleA),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        observations.convertToTask(ids.orgB, ids.vehicleA, obs.id as string, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects creating a case for a vehicle outside the organization', async () => {
      const { store, serviceCases } = harness();
      const { ids } = store;

      await expect(
        serviceCases.create(ids.orgB, {
          title: 'Illegal',
          category: 'SERVICE',
          vehicleId: ids.vehicleA,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Per-vehicle health failure isolation', () => {
    it('does not block unrelated vehicles when one case blocks rental', async () => {
      const { store, serviceCases } = harness();
      const { ids } = store;

      await serviceCases.create(ids.orgA, {
        title: 'Blocked vehicle',
        category: 'REPAIR',
        vehicleId: ids.vehicleA,
        blocksRental: true,
      });
      await serviceCases.create(ids.orgA, {
        title: 'Healthy vehicle',
        category: 'SERVICE',
        vehicleId: ids.vehicleB,
        blocksRental: false,
      });

      const blockingVehicleIds = (await serviceCases.list(ids.orgA))
        .filter((row) => row.blocksRental && row.status !== 'COMPLETED' && row.status !== 'CANCELLED')
        .map((row) => row.vehicleId);

      expect(blockingVehicleIds).toEqual([ids.vehicleA]);
      expect(blockingVehicleIds).not.toContain(ids.vehicleB);
    });
  });

  describe('Scheduling timestamps remain stable', () => {
    it('uses the pipeline fixed clock for opened cases', async () => {
      const { store, serviceCases } = harness();
      const { ids } = store;

      const serviceCase = await serviceCases.create(ids.orgA, {
        title: 'Opened now',
        category: 'SERVICE',
        vehicleId: ids.vehicleA,
      });

      expect(new Date(serviceCase.openedAt).getTime()).toBe(FHS_PIPELINE_FIXED_NOW.getTime());
    });
  });
});
