import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
} from '@prisma/client';
import { BrakeComponentInstallationService } from './brake-component-installation.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_ID = 'veh-1';
const SERVICE_EVENT_ID = 'svc-1';
const EVIDENCE_ID = 'ev-1';
const SPEC_ID = 'spec-1';

function buildHarness() {
  const state = {
    installations: new Map<string, any>(),
    counter: 0,
  };

  const vehicle = {
    findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id !== VEHICLE_ID) return null;
      if (where.organizationId && where.organizationId !== ORG_A) return null;
      return { id: VEHICLE_ID, organizationId: ORG_A };
    }),
  };

  const vehicleServiceEvent = {
    findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id !== SERVICE_EVENT_ID) return null;
      return { vehicleId: VEHICLE_ID };
    }),
    delete: jest.fn().mockImplementation(async () => {
      const err: any = new Error('restrict');
      err.code = 'P2003';
      throw err;
    }),
  };

  const brakeEvidence = {
    findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id !== EVIDENCE_ID) return null;
      return { vehicleId: VEHICLE_ID };
    }),
    delete: jest.fn().mockImplementation(async () => {
      const err: any = new Error('restrict');
      err.code = 'P2003';
      throw err;
    }),
  };

  const vehicleBrakeReferenceSpec = {
    findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id !== SPEC_ID) return null;
      return { vehicleId: VEHICLE_ID };
    }),
    delete: jest.fn().mockImplementation(async () => {
      const err: any = new Error('restrict');
      err.code = 'P2003';
      throw err;
    }),
  };

  const brakeComponentInstallation = {
    findMany: jest.fn().mockImplementation(async ({ where }: any) =>
      [...state.installations.values()].filter((row) => row.vehicleId === where.vehicleId),
    ),
    findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id) return state.installations.get(where.id) ?? null;
      return (
        [...state.installations.values()].find((row) => {
          if (row.vehicleId !== where.vehicleId) return false;
          if (where.componentType && row.componentType !== where.componentType) return false;
          if (where.status && row.status !== where.status) return false;
          if (where.removedAt === null && row.removedAt != null) return false;
          return true;
        }) ?? null
      );
    }),
    create: jest.fn().mockImplementation(async ({ data }: any) => {
      state.counter += 1;
      const id = `inst-${state.counter}`;
      const row = { id, removedAt: null, removedOdometerKm: null, ...data };
      const activeConflict = [...state.installations.values()].find(
        (existing) =>
          existing.vehicleId === row.vehicleId &&
          existing.componentType === row.componentType &&
          existing.status === BrakeComponentInstallationStatus.ACTIVE &&
          existing.removedAt == null &&
          row.status === BrakeComponentInstallationStatus.ACTIVE,
      );
      if (activeConflict) {
        const err: any = new Error('unique');
        err.code = 'P2002';
        err.meta = { target: ['brake_component_installations_one_active_per_vehicle_component'] };
        throw err;
      }
      state.installations.set(id, row);
      return row;
    }),
    update: jest.fn().mockImplementation(async ({ where, data }: any) => {
      const current = state.installations.get(where.id);
      if (!current) throw new Error('missing');
      const next = { ...current, ...data };
      state.installations.set(where.id, next);
      return next;
    }),
  };

  const prisma = {
    vehicle,
    vehicleServiceEvent,
    brakeEvidence,
    vehicleBrakeReferenceSpec,
    brakeComponentInstallation,
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma)),
  } as any;

  const svc = new BrakeComponentInstallationService(prisma);
  return { svc, prisma, state };
}

describe('BrakeComponentInstallationService', () => {
  const installedAt = new Date('2026-03-01T10:00:00.000Z');

  it('installs four active components independently', async () => {
    const { svc } = buildHarness();
    const types = [
      BrakeComponentInstallationType.FRONT_PADS,
      BrakeComponentInstallationType.REAR_PADS,
      BrakeComponentInstallationType.FRONT_DISCS,
      BrakeComponentInstallationType.REAR_DISCS,
    ];

    for (const componentType of types) {
      const row = await svc.installComponent({
        organizationId: ORG_A,
        vehicleId: VEHICLE_ID,
        componentType,
        installedAt,
        installedOdometerKm: 45000,
        anchorThicknessMm: 9,
        anchorSource: BrakeComponentInstallationAnchorSource.MEASURED,
      });
      expect(row.status).toBe(BrakeComponentInstallationStatus.ACTIVE);
    }

    const active = await svc.listActiveInstallations(VEHICLE_ID, ORG_A);
    expect(active).toHaveLength(4);
  });

  it('rejects duplicate active component without supersede', async () => {
    const { svc } = buildHarness();
    await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.FRONT_PADS,
      installedAt,
    });

    await expect(
      svc.installComponent({
        organizationId: ORG_A,
        vehicleId: VEHICLE_ID,
        componentType: BrakeComponentInstallationType.FRONT_PADS,
        installedAt: new Date('2026-04-01T10:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('supersedes active installation on replacement install', async () => {
    const { svc, state } = buildHarness();
    const first = await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.FRONT_PADS,
      installedAt,
      installedOdometerKm: 44000,
      supersedeActive: true,
    });

    const second = await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.FRONT_PADS,
      installedAt: new Date('2026-06-01T10:00:00.000Z'),
      installedOdometerKm: 52000,
      supersedeActive: true,
    });

    expect(state.installations.get(first.id).status).toBe(BrakeComponentInstallationStatus.REMOVED);
    expect(second.status).toBe(BrakeComponentInstallationStatus.ACTIVE);
    const history = await svc.listVehicleInstallations(VEHICLE_ID, ORG_A);
    expect(history).toHaveLength(2);
  });

  it('closes installation as REMOVED or RETIRED', async () => {
    const { svc } = buildHarness();
    const installed = await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.REAR_PADS,
      installedAt,
      installedOdometerKm: 30000,
    });

    const removed = await svc.closeInstallation({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      installationId: installed.id,
      removedAt: new Date('2026-07-01T10:00:00.000Z'),
      removedOdometerKm: 36000,
      status: BrakeComponentInstallationStatus.REMOVED,
    });
    expect(removed.status).toBe(BrakeComponentInstallationStatus.REMOVED);

    const replacement = await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.REAR_PADS,
      installedAt: new Date('2026-07-02T10:00:00.000Z'),
      installedOdometerKm: 36050,
      supersedeActive: false,
    });

    const retired = await svc.closeInstallation({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      installationId: replacement.id,
      removedAt: new Date('2026-08-01T10:00:00.000Z'),
      removedOdometerKm: 40000,
      status: BrakeComponentInstallationStatus.RETIRED,
    });
    expect(retired.status).toBe(BrakeComponentInstallationStatus.RETIRED);
  });

  it('preserves chronological history ordering', async () => {
    const { svc } = buildHarness();
    await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.FRONT_DISCS,
      installedAt: new Date('2026-01-01T10:00:00.000Z'),
      supersedeActive: true,
    });
    await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.FRONT_DISCS,
      installedAt: new Date('2026-06-01T10:00:00.000Z'),
      supersedeActive: true,
    });

    const history = await svc.listVehicleInstallations(VEHICLE_ID, ORG_A);
    expect(history[0].installedAt.getTime()).toBeLessThan(history[1].installedAt.getTime());
  });

  it('rejects cross-tenant access', async () => {
    const { svc } = buildHarness();
    await expect(
      svc.installComponent({
        organizationId: ORG_B,
        vehicleId: VEHICLE_ID,
        componentType: BrakeComponentInstallationType.FRONT_PADS,
        installedAt,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('links service and evidence references for the same vehicle', async () => {
    const { svc } = buildHarness();
    const row = await svc.installComponent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      componentType: BrakeComponentInstallationType.FRONT_PADS,
      installedAt,
      serviceEventId: SERVICE_EVENT_ID,
      sourceEvidenceId: EVIDENCE_ID,
      referenceSpecId: SPEC_ID,
      anchorSource: BrakeComponentInstallationAnchorSource.MEASURED,
    });

    expect(row.serviceEventId).toBe(SERVICE_EVENT_ID);
    expect(row.sourceEvidenceId).toBe(EVIDENCE_ID);
    expect(row.referenceSpecId).toBe(SPEC_ID);
  });

  it('maps prisma unique violation to conflict for duplicate active rows', async () => {
    const { svc, prisma } = buildHarness();
    prisma.$transaction.mockImplementationOnce(async () => {
      const err: any = new Error('unique');
      err.code = 'P2002';
      err.meta = { target: ['brake_component_installations_one_active_per_vehicle_component'] };
      throw err;
    });

    await expect(
      svc.installComponent({
        organizationId: ORG_A,
        vehicleId: VEHICLE_ID,
        componentType: BrakeComponentInstallationType.REAR_DISCS,
        installedAt,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks delete of referenced service event and evidence (Restrict semantics)', async () => {
    const { prisma } = buildHarness();
    await expect(prisma.vehicleServiceEvent.delete({ where: { id: SERVICE_EVENT_ID } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(prisma.brakeEvidence.delete({ where: { id: EVIDENCE_ID } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(
      prisma.vehicleBrakeReferenceSpec.delete({ where: { id: SPEC_ID } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });
});
