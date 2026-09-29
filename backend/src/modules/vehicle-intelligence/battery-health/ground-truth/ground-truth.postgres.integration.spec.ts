import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import {
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  PrismaClient,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ServiceEventsService } from '../../service-events/service-events.service';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { GROUND_TRUTH_ADMISSION_REASON } from './ground-truth-admission.types';
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { BatteryGroundTruthService } from './ground-truth.service';
import { BatteryGroundTruthSourceResolver } from './ground-truth-source.resolver';

const LIVE = process.env.BATTERY_V2_GROUND_TRUTH_INTEGRATION === '1';

const LEGACY_ORG_BACKFILL_SQL = readFileSync(
  join(
    __dirname,
    '../../../../../prisma/migrations/20260929120000_battery_ground_truth_events/migration.sql',
  ),
  'utf8',
)
  .split('\n')
  .filter((line) => line.startsWith('UPDATE vehicle_service_events'))
  .join('\n');

async function createOrgVehicle(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `GT G1 ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${org.id}::uuid,
      ${vin},
      'Test',
      'EV',
      2024,
      'ELECTRIC'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`GT-${suffix}`},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

(LIVE ? describe : describe.skip)('BatteryGroundTruth G1 PostgreSQL', () => {
  let prisma: PrismaClient;
  let gtService: BatteryGroundTruthService;
  let gtRepo: BatteryGroundTruthRepository;
  let serviceEvents: ServiceEventsService;

  beforeAll(async () => {
    const ok = await probePostgresDatabase();
    if (!ok) throw new Error('DATABASE_URL not reachable');
    prisma = new PrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    gtRepo = new BatteryGroundTruthRepository(prismaService);
    const resolver = new BatteryGroundTruthSourceResolver(prismaService);
    gtService = new BatteryGroundTruthService(prismaService, gtRepo, resolver);
    serviceEvents = new ServiceEventsService(prismaService, {
      onServiceHistoryChanged: jest.fn(),
    } as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('PG-A — migration tables and partial unique indexes exist', async () => {
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'battery_ground_truth_events_active_fingerprint_key',
        'battery_ground_truth_one_confirmed_successor_per_prior'
      )
    `;
    expect(indexes).toHaveLength(2);
  });

  it('PG-F — post-migration GT table has no seed rows from migration', async () => {
    expect(await prisma.batteryGroundTruthEvent.count()).toBe(0);
  });

  it('PG-B — concurrent same-source idempotency', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-03-01T10:00:00.000Z');
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.4,
        unit: 'V',
        observedAt,
      },
    });
    const candidate = {
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT' as const,
      batteryScope: 'LV' as const,
      effectiveAt: observedAt,
      sourceAuthority: 'WORKSHOP' as const,
      pointers: { sourceBatteryEvidenceId: evidence.id },
    };
    const [a, b] = await Promise.all([
      gtService.admitAndPersist(candidate),
      gtService.admitAndPersist(candidate),
    ]);
    const ids = new Set(
      [a, b]
        .filter((r) => r.outcome === 'PERSISTED' || r.outcome === 'IDEMPOTENT_EXISTING')
        .map((r) => ('groundTruthEventId' in r ? r.groundTruthEventId : '')),
    );
    expect(ids.size).toBe(1);
  });

  it('PG-C — cross-tenant evidence rejected', async () => {
    const orgA = await createOrgVehicle(prisma);
    const orgB = await createOrgVehicle(prisma);
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId: orgA.vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.4,
        unit: 'V',
        observedAt: new Date('2026-03-02T10:00:00.000Z'),
      },
    });
    const result = await gtService.admitAndPersist({
      organizationId: orgB.organizationId,
      vehicleId: orgB.vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: evidence.id },
    });
    expect(result.outcome).toBe('RESOLUTION_FAILED');
  });

  it('PG-D — supersession chain', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-04-01T10:00:00.000Z');
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'HV',
        sourceType: BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: 91,
        unit: 'percent',
        observedAt,
      },
    });
    const first = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'HV',
      effectiveAt: observedAt,
      sourceAuthority: 'CONFIRMED_DOCUMENT',
      pointers: { sourceBatteryEvidenceId: evidence.id },
    });
    const evidence2 = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'HV',
        sourceType: BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
        valueType: BatteryEvidenceValueType.SOH_PERCENT,
        numericValue: 92,
        unit: 'percent',
        observedAt: new Date('2026-05-01T10:00:00.000Z'),
      },
    });
    const priorId =
      first.outcome === 'PERSISTED' || first.outcome === 'IDEMPOTENT_EXISTING'
        ? first.groundTruthEventId
        : '';
    await gtService.supersedeGroundTruth({
      organizationId,
      vehicleId,
      priorGroundTruthEventId: priorId,
      replacementCandidate: {
        organizationId,
        vehicleId,
        groundTruthType: 'WORKSHOP_MEASUREMENT',
        batteryScope: 'HV',
        effectiveAt: new Date('2026-05-01T10:00:00.000Z'),
        sourceAuthority: 'CONFIRMED_DOCUMENT',
        pointers: { sourceBatteryEvidenceId: evidence2.id },
      },
    });
    const prior = await prisma.batteryGroundTruthEvent.findUnique({ where: { id: priorId } });
    expect(prior?.verificationStatus).toBe('SUPERSEDED');
  });

  it('PG-E — manual service event create sets organizationId', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const created = await serviceEvents.create(
      vehicleId,
      { eventType: ServiceEventType.BATTERY_REPLACEMENT, eventDate: '2026-02-01' },
      { origin: ServiceEventOrigin.MANUAL },
    );
    expect(created.organizationId).toBe(organizationId);
  });

  it('PG-G — revocation repository ops roll back together', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-06-10T10:00:00.000Z');
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.1,
        unit: 'V',
        observedAt,
      },
    });
    const admitted = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: observedAt,
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: evidence.id },
    });
    const gtId =
      admitted.outcome === 'PERSISTED' || admitted.outcome === 'IDEMPOTENT_EXISTING'
        ? admitted.groundTruthEventId
        : '';
    await expect(
      prisma.$transaction(async (tx) => {
        await gtRepo.appendRevocation(
          {
            organizationId,
            groundTruthEventId: gtId,
            reasonCode: 'OPERATOR_REVOKE',
            revokedAt: new Date(),
          },
          tx,
        );
        throw new Error('ROLLBACK_TEST');
      }),
    ).rejects.toThrow('ROLLBACK_TEST');
    expect(
      await prisma.batteryGroundTruthRevocation.count({ where: { groundTruthEventId: gtId } }),
    ).toBe(0);
    const row = await prisma.batteryGroundTruthEvent.findUnique({ where: { id: gtId } });
    expect(row?.verificationStatus).toBe('CONFIRMED');
  });

  it('PG-H — supersession replacement insert rolls back with prior mark', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const t0 = new Date('2026-06-11T10:00:00.000Z');
    const ev1 = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.15,
        unit: 'V',
        observedAt: t0,
      },
    });
    const first = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: t0,
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: ev1.id },
    });
    const priorId =
      first.outcome === 'PERSISTED' || first.outcome === 'IDEMPOTENT_EXISTING'
        ? first.groundTruthEventId
        : '';
    const ev2 = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.16,
        unit: 'V',
        observedAt: new Date('2026-06-12T10:00:00.000Z'),
      },
    });
    const prepared = await gtService.prepareAdmitPayload({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: new Date('2026-06-12T10:00:00.000Z'),
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: ev2.id },
    });
    if (!('createInput' in prepared)) {
      throw new Error(`expected prepared payload, got ${prepared.outcome}`);
    }
    await expect(
      prisma.$transaction(async (tx) => {
        await gtRepo.createConfirmedEvent(
          {
            ...prepared.createInput,
            supersedesGroundTruthEventId: priorId,
          },
          tx,
        );
        throw new Error('ROLLBACK_SUPERSEDE_TEST');
      }),
    ).rejects.toThrow('ROLLBACK_SUPERSEDE_TEST');
    expect(
      await prisma.batteryGroundTruthEvent.count({
        where: { organizationId, verificationStatus: 'CONFIRMED' },
      }),
    ).toBe(1);
    const prior = await prisma.batteryGroundTruthEvent.findUnique({ where: { id: priorId } });
    expect(prior?.verificationStatus).toBe('CONFIRMED');
  });

  it('PG-I — concurrent supersession yields one active successor', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const t0 = new Date('2026-07-01T10:00:00.000Z');
    const ev1 = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.2,
        unit: 'V',
        observedAt: t0,
      },
    });
    const first = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: t0,
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: ev1.id },
    });
    const priorId =
      first.outcome === 'PERSISTED' || first.outcome === 'IDEMPOTENT_EXISTING'
        ? first.groundTruthEventId
        : '';
    const ev2 = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.3,
        unit: 'V',
        observedAt: new Date('2026-07-02T10:00:00.000Z'),
      },
    });
    const ev3 = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.31,
        unit: 'V',
        observedAt: new Date('2026-07-03T10:00:00.000Z'),
      },
    });
    const base = {
      organizationId,
      vehicleId,
      priorGroundTruthEventId: priorId,
    };
    const results = await Promise.allSettled([
      gtService.supersedeGroundTruth({
        ...base,
        replacementCandidate: {
          organizationId,
          vehicleId,
          groundTruthType: 'WORKSHOP_MEASUREMENT',
          batteryScope: 'LV',
          effectiveAt: new Date('2026-07-02T10:00:00.000Z'),
          sourceAuthority: 'WORKSHOP',
          pointers: { sourceBatteryEvidenceId: ev2.id },
        },
      }),
      gtService.supersedeGroundTruth({
        ...base,
        replacementCandidate: {
          organizationId,
          vehicleId,
          groundTruthType: 'WORKSHOP_MEASUREMENT',
          batteryScope: 'LV',
          effectiveAt: new Date('2026-07-03T10:00:00.000Z'),
          sourceAuthority: 'WORKSHOP',
          pointers: { sourceBatteryEvidenceId: ev3.id },
        },
      }),
    ]);
    const successes = results.filter((r) => r.status === 'fulfilled').length;
    expect(successes).toBeGreaterThanOrEqual(1);
    const successors = await prisma.batteryGroundTruthEvent.count({
      where: {
        organizationId,
        supersedesGroundTruthEventId: priorId,
        verificationStatus: 'CONFIRMED',
      },
    });
    expect(successors).toBe(1);
  });

  it('PG-J — revoked fingerprint cannot auto-resurrect', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-08-01T10:00:00.000Z');
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.6,
        unit: 'V',
        observedAt,
      },
    });
    const candidate = {
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT' as const,
      batteryScope: 'LV' as const,
      effectiveAt: observedAt,
      sourceAuthority: 'WORKSHOP' as const,
      pointers: { sourceBatteryEvidenceId: evidence.id },
    };
    const first = await gtService.admitAndPersist(candidate);
    const gtId =
      first.outcome === 'PERSISTED' || first.outcome === 'IDEMPOTENT_EXISTING'
        ? first.groundTruthEventId
        : '';
    await gtService.revokeGroundTruth({
      organizationId,
      groundTruthEventId: gtId,
      reasonCode: 'OPERATOR_REVOKE',
    });
    const replay = await gtService.admitAndPersist(candidate);
    expect(replay.outcome).toBe('NOT_ADMITTED');
    expect(replay.admission.reasons).toContain(
      GROUND_TRUTH_ADMISSION_REASON.GROUND_TRUTH_SOURCE_PREVIOUSLY_REVOKED,
    );
  });

  it('PG-K — null service-event org fails closed', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const event = await prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        eventType: ServiceEventType.BATTERY_REPLACEMENT,
        eventDate: new Date('2026-01-10'),
        origin: ServiceEventOrigin.MANUAL,
      },
    });
    const result = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'BATTERY_REPLACEMENT',
      batteryScope: 'LV',
      sourceAuthority: 'CONFIRMED_DOCUMENT',
      pointers: { sourceServiceEventId: event.id },
    });
    expect(result.outcome).toBe('RESOLUTION_FAILED');
  });

  it('PG-L — null document tenant/vehicle fails closed', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const doc = await prisma.vehicleDocumentExtraction.create({
      data: {
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
      },
    });
    const result = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      sourceAuthority: 'CONFIRMED_DOCUMENT',
      pointers: { sourceDocumentExtractionId: doc.id },
    });
    expect(result.outcome).toBe('RESOLUTION_FAILED');
  });

  it('PG-M — null BatteryEvidence.vehicleId fails closed', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId: null,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.0,
        unit: 'V',
        observedAt: new Date('2026-02-02T10:00:00.000Z'),
      },
    });
    const result = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: evidence.id },
    });
    expect(result.outcome).toBe('RESOLUTION_FAILED');
  });

  it('PG-N — cross-pointer provenance mismatch rejected', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const doc = await prisma.vehicleDocumentExtraction.create({
      data: {
        organizationId,
        vehicleId,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
      },
    });
    const otherDoc = await prisma.vehicleDocumentExtraction.create({
      data: {
        organizationId,
        vehicleId,
        status: 'APPLIED',
        effectiveDocumentType: 'BATTERY',
      },
    });
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.DOCUMENT_CONFIRMED,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.7,
        unit: 'V',
        observedAt: new Date('2026-02-03T10:00:00.000Z'),
        documentExtractionId: doc.id,
      },
    });
    const result = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      sourceAuthority: 'CONFIRMED_DOCUMENT',
      pointers: {
        sourceBatteryEvidenceId: evidence.id,
        sourceDocumentExtractionId: otherDoc.id,
      },
    });
    expect(result.outcome).toBe('RESOLUTION_FAILED');
  });

  it('PG-O — numeric change changes fingerprint identity', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-09-01T10:00:00.000Z');
    const evA = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.8,
        unit: 'V',
        observedAt,
      },
    });
    const evB = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.9,
        unit: 'V',
        observedAt,
      },
    });
    const a = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: observedAt,
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: evA.id },
    });
    const b = await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: observedAt,
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: evB.id },
    });
    if (a.outcome === 'PERSISTED' || a.outcome === 'IDEMPOTENT_EXISTING') {
      if (b.outcome === 'PERSISTED' || b.outcome === 'IDEMPOTENT_EXISTING') {
        expect(a.groundTruthEventId).not.toBe(b.groundTruthEventId);
      }
    }
  });

  it('PG-P — operational vehicle delete does not cascade GT', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-10-01T10:00:00.000Z');
    const evidence = await prisma.batteryEvidence.create({
      data: {
        vehicleId,
        scope: 'LV',
        sourceType: BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT,
        valueType: BatteryEvidenceValueType.VOLTAGE_V,
        numericValue: 12.2,
        unit: 'V',
        observedAt,
      },
    });
    await gtService.admitAndPersist({
      organizationId,
      vehicleId,
      groundTruthType: 'WORKSHOP_MEASUREMENT',
      batteryScope: 'LV',
      effectiveAt: observedAt,
      sourceAuthority: 'WORKSHOP',
      pointers: { sourceBatteryEvidenceId: evidence.id },
    });
    await expect(prisma.vehicle.delete({ where: { id: vehicleId } })).rejects.toThrow();
  });

  it('PG-Q — legacy service-event org backfill SQL semantics', async () => {
    const gtBefore = await prisma.batteryGroundTruthEvent.count();
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const event = await prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        eventType: ServiceEventType.REPAIR,
        eventDate: new Date('2025-12-01'),
        origin: ServiceEventOrigin.MANUAL,
      },
    });
    await prisma.$executeRaw`UPDATE vehicle_service_events SET organization_id = NULL WHERE id = ${event.id}`;
    expect(LEGACY_ORG_BACKFILL_SQL.length).toBeGreaterThan(0);
    await prisma.$executeRawUnsafe(LEGACY_ORG_BACKFILL_SQL);
    const refreshed = await prisma.vehicleServiceEvent.findUnique({ where: { id: event.id } });
    expect(refreshed?.organizationId).toBe(organizationId);
    const gtAfter = await prisma.batteryGroundTruthEvent.count();
    expect(gtAfter).toBe(gtBefore);
  });
});
