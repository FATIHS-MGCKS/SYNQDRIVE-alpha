import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
  BrakeServiceKind,
} from '@prisma/client';
import { BrakeComponentLifecycleService } from './brake-component-lifecycle.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_ID = 'veh-1';
const SERVICE_DATE = '2026-06-15T10:00:00.000Z';

function buildHarness() {
  const state = {
    installations: new Map<string, any>(),
    events: new Map<string, any>(),
    evidence: new Map<string, any>(),
    bhc: null as any,
    counter: 0,
    txShouldFail: false,
  };

  const vehicle = {
    findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id !== VEHICLE_ID) return null;
      if (where.organizationId && where.organizationId !== ORG_A) return null;
      return { id: VEHICLE_ID, organizationId: ORG_A };
    }),
  };

  const brakeComponentInstallation = {
    findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
      if (where.id) return state.installations.get(where.id) ?? null;
      return (
        [...state.installations.values()].find((row) => {
          if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
          if (where.componentType && row.componentType !== where.componentType) return false;
          if (where.status && row.status !== where.status) return false;
          if (where.removedAt === null && row.removedAt != null) return false;
          return true;
        }) ?? null
      );
    }),
    findMany: jest.fn().mockImplementation(async ({ where }: any) =>
      [...state.installations.values()].filter((row) => {
        if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
        if (where.serviceEventId && row.serviceEventId !== where.serviceEventId) return false;
        return true;
      }),
    ),
    create: jest.fn().mockImplementation(async ({ data }: any) => {
      if (state.txShouldFail) throw new Error('tx_failed');
      state.counter += 1;
      const id = `inst-${state.counter}`;
      const activeConflict = [...state.installations.values()].find(
        (row) =>
          row.vehicleId === data.vehicleId &&
          row.componentType === data.componentType &&
          row.status === BrakeComponentInstallationStatus.ACTIVE &&
          row.removedAt == null &&
          data.status === BrakeComponentInstallationStatus.ACTIVE,
      );
      if (activeConflict) {
        const err: any = new Error('unique');
        err.code = 'P2002';
        err.meta = { target: ['brake_component_installations_one_active_per_vehicle_component'] };
        throw err;
      }
      const row = { id, removedAt: null, removedOdometerKm: null, ...data };
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
    updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
      for (const row of state.installations.values()) {
        if (where.id?.in?.includes(row.id)) {
          if (!where.componentType?.in || where.componentType.in.includes(row.componentType)) {
            state.installations.set(row.id, { ...row, ...data });
          }
        }
      }
      return { count: 1 };
    }),
  };

  const vehicleServiceEvent = {
    create: jest.fn().mockImplementation(async ({ data }: any) => {
      state.counter += 1;
      const id = `evt-${state.counter}`;
      const row = { id, createdAt: new Date(), ...data };
      state.events.set(id, row);
      return row;
    }),
    update: jest.fn().mockImplementation(async ({ where, data }: any) => {
      const current = state.events.get(where.id);
      state.events.set(where.id, { ...current, ...data });
      return state.events.get(where.id);
    }),
    findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
      if (!where.notes?.contains) return null;
      const marker = where.notes.contains;
      return (
        [...state.events.values()].find(
          (e) => e.vehicleId === where.vehicleId && String(e.notes ?? '').includes(marker),
        ) ?? null
      );
    }),
  };

  const brakeEvidence = {
    create: jest.fn().mockImplementation(async ({ data }: any) => {
      state.counter += 1;
      const id = `ev-${state.counter}`;
      const row = { id, ...data };
      state.evidence.set(id, row);
      return row;
    }),
  };

  const brakeHealthCurrent = {
    findUnique: jest.fn().mockImplementation(async () => state.bhc),
    upsert: jest.fn().mockImplementation(async ({ create, update }: any) => {
      state.bhc = state.bhc ? { ...state.bhc, ...update } : create;
      return state.bhc;
    }),
  };

  const prisma = {
    vehicle,
    brakeComponentInstallation,
    vehicleServiceEvent,
    brakeEvidence,
    brakeHealthCurrent,
    $transaction: jest.fn().mockImplementation(async (fn: any) => {
      const tx = {
        brakeComponentInstallation,
        vehicleServiceEvent,
        brakeEvidence,
      };
      return fn(tx);
    }),
  } as any;

  const brakeHealth = {
    applyScopedComponentAnchors: jest.fn().mockResolvedValue({ updated: true, recalculated: true }),
  };

  const svc = new BrakeComponentLifecycleService(prisma, brakeHealth as any);
  return { svc, prisma, brakeHealth, state };
}

const base = {
  organizationId: ORG_A,
  vehicleId: VEHICLE_ID,
  serviceDate: SERVICE_DATE,
  odometerKm: 52000,
};

describe('BrakeComponentLifecycleService', () => {
  it('installs front pads only without touching other components', async () => {
    const { svc, brakeHealth } = buildHarness();
    const result = await svc.installComponent({
      ...base,
      componentType: BrakeComponentInstallationType.FRONT_PADS,
      anchorThicknessMm: 9.5,
      anchorSource: BrakeComponentInstallationAnchorSource.MEASURED,
    });

    expect(result.components).toEqual([BrakeComponentInstallationType.FRONT_PADS]);
    expect(result.installationIds).toHaveLength(1);
    expect(brakeHealth.applyScopedComponentAnchors).toHaveBeenCalledWith(
      VEHICLE_ID,
      expect.objectContaining({
        components: [
          expect.objectContaining({ componentType: BrakeComponentInstallationType.FRONT_PADS }),
        ],
      }),
    );
    expect(result.auditLog.some((e) => e.action === 'CREATE_INSTALLATION')).toBe(true);
  });

  it('replaces rear pads only', async () => {
    const { svc, state } = buildHarness();
    await svc.installComponent({
      ...base,
      componentType: BrakeComponentInstallationType.REAR_PADS,
      anchorThicknessMm: 8,
      anchorSource: BrakeComponentInstallationAnchorSource.MEASURED,
    });

    const result = await svc.replaceComponent({
      ...base,
      scope: ['rear_pads'],
      thickness: { rearPadMm: 10 },
      serviceDate: '2026-07-01T10:00:00.000Z',
    });

    expect(result.components).toEqual([BrakeComponentInstallationType.REAR_PADS]);
    expect(result.closedInstallationIds).toHaveLength(1);
    expect(result.installationIds).toHaveLength(1);
    const activeRear = [...state.installations.values()].filter(
      (r) =>
        r.componentType === BrakeComponentInstallationType.REAR_PADS &&
        r.status === BrakeComponentInstallationStatus.ACTIVE,
    );
    expect(activeRear).toHaveLength(1);
  });

  it('replaces front axle pads and discs together', async () => {
    const { svc, brakeHealth } = buildHarness();
    const result = await svc.replaceComponent({
      ...base,
      scope: ['front_pads', 'front_discs'],
      thickness: { frontPadMm: 10, frontDiscMm: 28 },
    });

    expect(result.components).toEqual([
      BrakeComponentInstallationType.FRONT_PADS,
      BrakeComponentInstallationType.FRONT_DISCS,
    ]);
    expect(brakeHealth.applyScopedComponentAnchors).toHaveBeenCalledWith(
      VEHICLE_ID,
      expect.objectContaining({
        components: expect.arrayContaining([
          expect.objectContaining({ componentType: BrakeComponentInstallationType.FRONT_PADS }),
          expect.objectContaining({ componentType: BrakeComponentInstallationType.FRONT_DISCS }),
        ]),
      }),
    );
    expect(
      brakeHealth.applyScopedComponentAnchors.mock.calls[0][1].components,
    ).toHaveLength(2);
  });

  it('supports all four components when explicitly scoped', async () => {
    const { svc } = buildHarness();
    const result = await svc.registerMeasuredBaseline({
      ...base,
      scope: ['front_pads', 'rear_pads', 'front_discs', 'rear_discs'],
      thickness: { frontPadMm: 10, rearPadMm: 10, frontDiscMm: 28, rearDiscMm: 10 },
      serviceKind: BrakeServiceKind.FULL_BRAKE_SERVICE,
    });

    expect(result.components).toHaveLength(4);
    expect(result.evidenceIds.length).toBeGreaterThan(0);
  });

  it('runs parallel axle replacements in one transaction', async () => {
    const { svc, state } = buildHarness();
    const result = await svc.replaceComponent({
      ...base,
      scope: ['front_pads', 'rear_pads'],
      thickness: { frontPadMm: 9.8, rearPadMm: 9.1 },
    });

    expect(result.installationIds).toHaveLength(2);
    expect(state.events.size).toBe(1);
    expect(result.auditLog.some((e) => e.action === 'SERVICE_EVENT_CREATED')).toBe(true);
  });

  it('rolls back when transaction fails', async () => {
    const { svc, state } = buildHarness();
    state.txShouldFail = true;
    await expect(
      svc.replaceComponent({
        ...base,
        scope: ['front_discs'],
        thickness: { frontDiscMm: 27 },
      }),
    ).rejects.toThrow('tx_failed');
    expect(state.installations.size).toBe(0);
  });

  it('replays idempotent operations by idempotency key', async () => {
    const { svc } = buildHarness();
    const first = await svc.replaceComponent({
      ...base,
      scope: ['front_pads'],
      thickness: { frontPadMm: 8.5 },
      idempotencyKey: 'op-123',
    });
    const second = await svc.replaceComponent({
      ...base,
      scope: ['front_pads'],
      thickness: { frontPadMm: 8.5 },
      idempotencyKey: 'op-123',
    });

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.serviceEventId).toBe(first.serviceEventId);
  });

  it('rejects duplicate active install without replace', async () => {
    const { svc } = buildHarness();
    await svc.installComponent({
      ...base,
      componentType: BrakeComponentInstallationType.FRONT_DISCS,
      anchorThicknessMm: 28,
    });

    await expect(
      svc.installComponent({
        ...base,
        componentType: BrakeComponentInstallationType.FRONT_DISCS,
        anchorThicknessMm: 27,
        serviceDate: '2026-08-01T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects wrong organization', async () => {
    const { svc } = buildHarness();
    await expect(
      svc.installComponent({
        ...base,
        organizationId: ORG_B,
        componentType: BrakeComponentInstallationType.REAR_DISCS,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registerDocumentedReplacement uses documented source not measured', async () => {
    const { svc, state } = buildHarness();
    const result = await svc.registerDocumentedReplacement({
      ...base,
      scope: ['front_pads'],
      nominalThicknessMm: 10,
    });

    const inst = state.installations.get(result.installationIds[0]);
    expect(inst.anchorSource).toBe(BrakeComponentInstallationAnchorSource.DOCUMENTED_REPLACEMENT);
  });

  it('removeComponent closes active installation and preserves history', async () => {
    const { svc, state } = buildHarness();
    const installed = await svc.installComponent({
      ...base,
      componentType: BrakeComponentInstallationType.REAR_PADS,
      anchorThicknessMm: 7,
    });

    const removed = await svc.removeComponent({
      ...base,
      componentType: BrakeComponentInstallationType.REAR_PADS,
      serviceDate: '2026-08-01T10:00:00.000Z',
    });

    expect(removed.closedInstallationIds).toContain(installed.installationIds[0]);
    expect(state.installations.get(installed.installationIds[0]).status).toBe(
      BrakeComponentInstallationStatus.REMOVED,
    );
  });

  it('getActiveInstallation returns active row', async () => {
    const { svc } = buildHarness();
    await svc.installComponent({
      ...base,
      componentType: BrakeComponentInstallationType.FRONT_PADS,
      anchorThicknessMm: 9,
    });
    const active = await svc.getActiveInstallation(
      ORG_A,
      VEHICLE_ID,
      BrakeComponentInstallationType.FRONT_PADS,
    );
    expect(active?.status).toBe(BrakeComponentInstallationStatus.ACTIVE);
  });

  it('rejects implausible odometer conflict', async () => {
    const { svc } = buildHarness();
    await expect(
      svc.replaceComponent({
        ...base,
        scope: ['front_pads'],
        odometerKm: 9_000_000,
        thickness: { frontPadMm: 8 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
