import {
  BatteryEvidenceScope,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  Prisma,
} from '@prisma/client';
import { BatteryMeasurementRepository } from './battery-measurement.repository';
import { BatteryMeasurementService } from './battery-measurement.service';
import {
  isBatteryMeasurementValueAllowed,
} from './battery-measurement-value';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_A = 'veh-a';
const SESSION_A = 'session-a';

describe('battery-measurement-value', () => {
  it('allows MISSED without numeric or text value', () => {
    expect(
      isBatteryMeasurementValueAllowed({
        quality: BatteryMeasurementQuality.MISSED,
      }),
    ).toBe(true);
  });

  it('rejects null-only values for VALID quality', () => {
    expect(
      isBatteryMeasurementValueAllowed({
        quality: BatteryMeasurementQuality.VALID,
      }),
    ).toBe(false);
  });
});

describe('BatteryMeasurementRepository (mocked Prisma)', () => {
  const measurements = new Map<string, any>();
  const tenantIdempotencyIndex = new Map<string, string>();
  const dedupIndex = new Map<string, string>();

  const prisma = {
    batteryMeasurement: {
      create: jest.fn(async ({ data }: any) => {
        const tenantKey = `${data.organizationId}|${data.vehicleId}|${data.idempotencyKey}`;
        const dedupKey = `${data.vehicleId}|${data.type}|${data.observedAt.toISOString()}`;
        if (tenantIdempotencyIndex.has(tenantKey) || dedupIndex.has(dedupKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = { id: `meas-${measurements.size + 1}`, ...data };
        measurements.set(row.id, row);
        tenantIdempotencyIndex.set(tenantKey, row.id);
        dedupIndex.set(dedupKey, row.id);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const compound = where.organizationId_vehicleId_idempotencyKey;
        if (!compound) return null;
        const key = `${compound.organizationId}|${compound.vehicleId}|${compound.idempotencyKey}`;
        const id = tenantIdempotencyIndex.get(key);
        return id ? measurements.get(id) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const compound = where.vehicleId_type_observedAt;
        const key = `${compound.vehicleId}|${compound.type}|${compound.observedAt.toISOString()}`;
        const id = dedupIndex.get(key);
        if (!id) throw new Error('not found');
        return measurements.get(id);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of measurements.values()) {
          if (where.id && row.id !== where.id) continue;
          if (where.organizationId && row.organizationId !== where.organizationId) {
            continue;
          }
          return row;
        }
        return null;
      }),
      findMany: jest.fn(async () => []),
    },
  };

  const repository = new BatteryMeasurementRepository(prisma as any);

  beforeEach(() => {
    measurements.clear();
    tenantIdempotencyIndex.clear();
    dedupIndex.clear();
    jest.clearAllMocks();
  });

  it('returns the same row on duplicate tenant idempotency key', async () => {
    const observedAt = new Date('2026-07-16T10:00:00.000Z');
    const input = {
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      scope: BatteryEvidenceScope.LV,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      numericValue: 12.41,
      unit: 'V',
      quality: BatteryMeasurementQuality.VALID,
      observedAt,
      idempotencyKey: 'lv-live:veh-a:1',
    };

    const first = await repository.createIdempotent(input);
    const second = await repository.createIdempotent({
      ...input,
      numericValue: 99,
    });

    expect(second.id).toBe(first.id);
    expect(second.numericValue).toBe(12.41);
    expect(measurements.size).toBe(1);
  });
});

describe('BatteryMeasurementService (mocked Prisma)', () => {
  const measurements = new Map<string, any>();
  const tenantIdempotencyIndex = new Map<string, string>();
  const dedupIndex = new Map<string, string>();

  const prisma = {
    vehicle: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.organizationId === ORG_A && where.id === VEHICLE_A) {
          return { id: VEHICLE_A };
        }
        return null;
      }),
    },
    batteryMeasurementSession: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (
          where.id === SESSION_A &&
          where.organizationId === ORG_A &&
          where.vehicleId === VEHICLE_A
        ) {
          return { id: SESSION_A };
        }
        return null;
      }),
    },
    batteryMeasurement: {
      create: jest.fn(async ({ data }: any) => {
        const tenantKey = `${data.organizationId}|${data.vehicleId}|${data.idempotencyKey}`;
        const dedupKey = `${data.vehicleId}|${data.type}|${data.observedAt.toISOString()}`;
        if (tenantIdempotencyIndex.has(tenantKey) || dedupIndex.has(dedupKey)) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        const row = {
          id: `meas-${measurements.size + 1}`,
          scope: BatteryEvidenceScope.LV,
          receivedAt: new Date('2026-07-16T10:00:01.000Z'),
          createdAt: new Date('2026-07-16T10:00:01.000Z'),
          ...data,
        };
        measurements.set(row.id, row);
        tenantIdempotencyIndex.set(tenantKey, row.id);
        dedupIndex.set(dedupKey, row.id);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: any) => {
        const compound = where.organizationId_vehicleId_idempotencyKey;
        const key = `${compound.organizationId}|${compound.vehicleId}|${compound.idempotencyKey}`;
        const id = tenantIdempotencyIndex.get(key);
        return id ? measurements.get(id) : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => {
        const compound = where.vehicleId_type_observedAt;
        const key = `${compound.vehicleId}|${compound.type}|${compound.observedAt.toISOString()}`;
        const id = dedupIndex.get(key);
        if (!id) throw new Error('not found');
        return measurements.get(id);
      }),
      findFirst: jest.fn(async ({ where }: any) => {
        for (const row of measurements.values()) {
          if (where.id === row.id && where.organizationId === row.organizationId) {
            return row;
          }
        }
        return null;
      }),
      findMany: jest.fn(async () => []),
    },
  };

  const repository = new BatteryMeasurementRepository(prisma as any);
  const service = new BatteryMeasurementService(prisma as any, repository);

  beforeEach(() => {
    measurements.clear();
    tenantIdempotencyIndex.clear();
    dedupIndex.clear();
    jest.clearAllMocks();
  });

  it('rejects create when vehicle is outside organization tenant', async () => {
    await expect(
      service.create({
        organizationId: ORG_B,
        vehicleId: VEHICLE_A,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        quality: BatteryMeasurementQuality.VALID,
        observedAt: new Date(),
        numericValue: 12.4,
        idempotencyKey: 'key-1',
      }),
    ).rejects.toThrow('Vehicle not found for organization scope');
  });

  it('rejects null-only measurement for VALID quality', async () => {
    await expect(
      service.create({
        organizationId: ORG_A,
        vehicleId: VEHICLE_A,
        type: BatteryMeasurementType.REST_60M,
        quality: BatteryMeasurementQuality.VALID,
        observedAt: new Date(),
        idempotencyKey: 'key-null',
      }),
    ).rejects.toThrow(
      'Measurement requires numericValue or textValue unless quality is MISSED or PROVIDER_ERROR',
    );
  });

  it('allows MISSED status measurement without numeric value', async () => {
    const created = await service.create({
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      sessionId: SESSION_A,
      type: BatteryMeasurementType.SESSION_MISSED,
      quality: BatteryMeasurementQuality.MISSED,
      observedAt: new Date('2026-07-16T10:00:00.000Z'),
      idempotencyKey: 'missed:1',
      context: { targetMessart: 'REST_60M', apiKey: 'strip-me' },
    });

    expect(created.numericValue).toBeNull();
    expect(created.context).toEqual({ targetMessart: 'REST_60M' });
    expect(created.sessionId).toBe(SESSION_A);
  });

  it('creates idempotently and isolates getById by organization', async () => {
    const observedAt = new Date('2026-07-16T11:00:00.000Z');
    const first = await service.create({
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      quality: BatteryMeasurementQuality.VALID,
      observedAt,
      numericValue: 12.5,
      unit: 'V',
      providerTimestamp: observedAt,
      receivedAt: new Date('2026-07-16T11:00:05.000Z'),
      idempotencyKey: 'lv:1',
      provenance: { syncJobRef: 'job-1', raw_payload: 'omit' },
    });

    const second = await service.create({
      organizationId: ORG_A,
      vehicleId: VEHICLE_A,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      quality: BatteryMeasurementQuality.VALID,
      observedAt,
      numericValue: 13.0,
      idempotencyKey: 'lv:1',
    });

    expect(second.id).toBe(first.id);
    expect(second.receivedAt).toEqual(first.receivedAt);
    await expect(service.getById(ORG_A, first.id)).resolves.toEqual(first);
    await expect(service.getById(ORG_B, first.id)).resolves.toBeNull();
  });
});
