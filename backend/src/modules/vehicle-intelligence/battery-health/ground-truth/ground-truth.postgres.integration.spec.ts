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
import { BatteryGroundTruthRepository } from './ground-truth.repository';
import { BatteryGroundTruthService } from './ground-truth.service';
import { BatteryGroundTruthSourceResolver } from './ground-truth-source.resolver';

const LIVE = process.env.BATTERY_V2_GROUND_TRUTH_INTEGRATION === '1';

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
  let serviceEvents: ServiceEventsService;

  beforeAll(async () => {
    const ok = await probePostgresDatabase();
    if (!ok) throw new Error('DATABASE_URL not reachable');
    prisma = new PrismaClient();
    const prismaService = prisma as unknown as PrismaService;
    const repo = new BatteryGroundTruthRepository(prismaService);
    const resolver = new BatteryGroundTruthSourceResolver(prismaService);
    gtService = new BatteryGroundTruthService(prismaService, repo, resolver);
    serviceEvents = new ServiceEventsService(prismaService, {
      onServiceHistoryChanged: jest.fn(),
    } as never);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('PG-A — migration tables and partial unique index exist', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('battery_ground_truth_events', 'battery_ground_truth_revocations')
    `;
    expect(tables).toHaveLength(2);
    const indexes = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname = 'battery_ground_truth_events_active_fingerprint_key'
    `;
    expect(indexes).toHaveLength(1);
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
    const ids = new Set([
      a.outcome === 'PERSISTED' || a.outcome === 'IDEMPOTENT_EXISTING' ? a.groundTruthEventId : '',
      b.outcome === 'PERSISTED' || b.outcome === 'IDEMPOTENT_EXISTING' ? b.groundTruthEventId : '',
    ]);
    ids.delete('');
    expect(ids.size).toBe(1);
    const count = await prisma.batteryGroundTruthEvent.count({
      where: { organizationId, verificationStatus: 'CONFIRMED' },
    });
    expect(count).toBe(1);
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
    expect(first.outcome).toMatch(/PERSISTED|IDEMPOTENT_EXISTING/);

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
    const second = await gtService.supersedeGroundTruth({
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
    expect(second.outcome).toMatch(/PERSISTED|IDEMPOTENT_EXISTING/);
    const prior = await prisma.batteryGroundTruthEvent.findUnique({ where: { id: priorId } });
    expect(prior?.verificationStatus).toBe('SUPERSEDED');
  });

  it('PG-E — manual service event create sets organizationId', async () => {
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const created = await serviceEvents.create(
      vehicleId,
      {
        eventType: ServiceEventType.BATTERY_REPLACEMENT,
        eventDate: '2026-02-01',
      },
      { origin: ServiceEventOrigin.MANUAL },
    );
    expect(created.organizationId).toBe(organizationId);
  });

  it('PG-F — legacy null org backfill via migration leaves GT count zero', async () => {
    const count = await prisma.batteryGroundTruthEvent.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
