import {
  BatteryChemistry,
  BatteryDriveProfile,
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  Prisma,
} from '@prisma/client';
import { BatteryMeasurementSessionRepository } from './battery-measurement-session.repository';
import { BatteryMeasurementSessionService } from './battery-measurement-session.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_A = 'veh-a';

function baseSessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    organizationId: ORG_A,
    vehicleId: VEHICLE_A,
    scope: BatteryEvidenceScope.LV,
    type: BatteryMeasurementSessionType.LV_REST_WINDOW,
    status: BatteryMeasurementSessionStatus.PLANNED,
    driveProfile: BatteryDriveProfile.ICE,
    chemistry: BatteryChemistry.AGM,
    startedAt: new Date('2026-07-16T10:00:00.000Z'),
    targetAt: null,
    endedAt: null,
    quality: BatteryMeasurementQuality.SHADOW,
    providerSource: 'DIMO',
    sourceEntityType: null,
    sourceEntityId: null,
    tripId: null,
    idempotencyKey: 'lv-rest:veh-a:1721124000000',
    metadata: { targetMessarts: ['REST_60M'] },
    modelVersion: 1,
    createdAt: new Date('2026-07-16T10:00:00.000Z'),
    updatedAt: new Date('2026-07-16T10:00:00.000Z'),
    ...overrides,
  };
}

describe('BatteryMeasurementSessionRepository (mocked Prisma)', () => {
  const sessions = new Map<string, any>();
  const idempotencyIndex = new Map<string, string>();

  const prisma = {
    batteryMeasurementSession: {
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.vehicleId}|${data.idempotencyKey}`;
        if (idempotencyIndex.has(key)) {
          const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: ['battery_measurement_sessions_idempotency_key'] },
          });
          throw err;
        }
        const row = { id: `session-${sessions.size + 1}`, ...data };
        sessions.set(row.id, row);
        idempotencyIndex.set(key, row.id);
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const compound = where.vehicleId_idempotencyKey;
        const key = `${compound.vehicleId}|${compound.idempotencyKey}`;
        const id = idempotencyIndex.get(key);
        if (!id) throw new Error('not found');
        return sessions.get(id);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of sessions.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.organizationId && row.organizationId !== where.organizationId) {
            continue;
          }
          if (where.vehicleId && row.vehicleId !== where.vehicleId) continue;
          return row;
        }
        return null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        [...sessions.values()].filter((row) => {
          if (where.organizationId && row.organizationId !== where.organizationId) {
            return false;
          }
          if (where.vehicleId && row.vehicleId !== where.vehicleId) return false;
          return true;
        }),
      ),
    },
  };

  const repository = new BatteryMeasurementSessionRepository(prisma as any);

  beforeEach(() => {
    sessions.clear();
    idempotencyIndex.clear();
    jest.clearAllMocks();
  });

  it('returns the same row on duplicate idempotency key', async () => {
    const input = {
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      scope: BatteryEvidenceScope.LV,
      type: BatteryMeasurementSessionType.LV_REST_WINDOW,
      startedAt: new Date('2026-07-16T10:00:00.000Z'),
      idempotencyKey: 'lv-rest:veh-a:1',
    };

    const first = await repository.createIdempotent(input);
    const second = await repository.createIdempotent({
      ...input,
      status: BatteryMeasurementSessionStatus.ACTIVE,
    });

    expect(second.id).toBe(first.id);
    expect(sessions.size).toBe(1);
  });

  it('scopes findByIdForOrganization to organizationId', async () => {
    const row = baseSessionRow({ organizationId: ORG_A });
    sessions.set(row.id, row);

    await expect(
      repository.findByIdForOrganization(ORG_A, row.id),
    ).resolves.toEqual(row);
    await expect(
      repository.findByIdForOrganization(ORG_B, row.id),
    ).resolves.toBeNull();
  });
});

describe('BatteryMeasurementSessionService (mocked Prisma)', () => {
  const sessions = new Map<string, any>();
  const idempotencyIndex = new Map<string, string>();

  const prisma = {
    vehicle: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.organizationId === ORG_A && where.id === VEHICLE_A) {
          return { id: VEHICLE_A };
        }
        return null;
      }),
    },
    vehicleTrip: {
      findFirst: jest.fn(async () => null),
    },
    batteryMeasurementSession: {
      create: jest.fn(async ({ data }: any) => {
        const key = `${data.vehicleId}|${data.idempotencyKey}`;
        if (idempotencyIndex.has(key)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = {
          id: `session-${sessions.size + 1}`,
          status: BatteryMeasurementSessionStatus.PLANNED,
          driveProfile: BatteryDriveProfile.UNKNOWN,
          chemistry: BatteryChemistry.UNKNOWN,
          quality: BatteryMeasurementQuality.SHADOW,
          modelVersion: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        sessions.set(row.id, row);
        idempotencyIndex.set(key, row.id);
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const compound = where.vehicleId_idempotencyKey;
        const key = `${compound.vehicleId}|${compound.idempotencyKey}`;
        const id = idempotencyIndex.get(key);
        if (!id) throw new Error('not found');
        return sessions.get(id);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of sessions.values()) {
          if (where.id === row.id && where.organizationId === row.organizationId) {
            return row;
          }
        }
        return null;
      }),
      findMany: jest.fn(async () => []),
    },
  };

  const repository = new BatteryMeasurementSessionRepository(prisma as any);
  const service = new BatteryMeasurementSessionService(prisma as any, repository);

  beforeEach(() => {
    sessions.clear();
    idempotencyIndex.clear();
    jest.clearAllMocks();
  });

  it('rejects create when vehicle is outside organization tenant', async () => {
    await expect(
      service.create({
        organizationId: ORG_B,
        vehicleId: VEHICLE_A,
        type: BatteryMeasurementSessionType.LV_REST_WINDOW,
        startedAt: new Date(),
        idempotencyKey: 'key-1',
      }),
    ).rejects.toThrow('Vehicle not found for organization scope');
  });

  it('creates idempotently within tenant scope', async () => {
    const first = await service.create({
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      type: BatteryMeasurementSessionType.ICE_START_PROXY,
      startedAt: new Date('2026-07-16T10:00:00.000Z'),
      idempotencyKey: 'ice-start:veh-a:1',
      metadata: {
        targetMessarts: ['START_DIP_PROXY'],
        driverName: 'must-be-stripped',
      },
    });

    const second = await service.create({
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      type: BatteryMeasurementSessionType.ICE_START_PROXY,
      startedAt: new Date('2026-07-16T10:00:00.000Z'),
      idempotencyKey: 'ice-start:veh-a:1',
    });

    expect(second.id).toBe(first.id);
    expect(first.metadata).toEqual({ targetMessarts: ['START_DIP_PROXY'] });
    expect(sessions.size).toBe(1);
  });

  it('does not return sessions across organizations on getById', async () => {
    const created = await service.create({
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      type: BatteryMeasurementSessionType.HV_CHARGE,
      startedAt: new Date(),
      idempotencyKey: 'hv-charge:1',
      scope: BatteryEvidenceScope.HV,
    });

    await expect(service.getById(ORG_A, created.id)).resolves.toEqual(created);
    await expect(service.getById(ORG_B, created.id)).resolves.toBeNull();
  });
});
