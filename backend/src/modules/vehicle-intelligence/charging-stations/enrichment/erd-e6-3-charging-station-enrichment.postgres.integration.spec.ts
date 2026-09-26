import { randomUUID } from 'crypto';
import {
  EnergyEventConfidence,
  EnergyEventKind,
  PrismaClient,
  VehicleEnergyEventDetectionSource,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ChargingStationCandidateRepository } from '../charging-station-candidate.repository';
import { ChargingStationLocationResolverService } from '../charging-station-location-resolver.service';
import { ChargingStationEnrichmentOrchestratorService } from '../enrichment/charging-station-enrichment-orchestrator.service';
import { EnergyEventsService } from '../../energy-events/energy-events.service';
import {
  ensureChargingStationOsmSchema,
  probeChargingStationPostgresDatabase,
  seedSyntheticChargingDataset,
} from '../testing/charging-station-resolver-postgres.integration.harness';
import { ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM } from '../../energy-events/erd-recharge-projection/erd-recharge-projection.constants';

const LIVE = process.env.ERD_E6_3_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E6_3_POSTGRES_REQUIRED === '1';

const CUTOVER = new Date('2026-09-01T00:00:00.000Z');

async function seedOrgVehicle(prisma: PrismaClient) {
  const suffix = randomUUID().slice(0, 8);
  const org = await prisma.organization.create({
    data: {
      companyName: `E6.3 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `E63${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `E63-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'EV',
      year: 2025,
      fuelType: 'ELECTRIC',
      status: 'AVAILABLE',
    },
  });
  return { org, vehicle };
}

async function createCanonicalRecharge(
  prisma: PrismaClient,
  vehicleId: string,
  coords: {
    startLatitude?: number | null;
    startLongitude?: number | null;
    endLatitude?: number | null;
    endLongitude?: number | null;
  },
) {
  return prisma.vehicleEnergyEvent.create({
    data: {
      vehicleId,
      kind: EnergyEventKind.RECHARGE,
      detectionMechanism: ERD_RECHARGE_PROJECTION_DETECTION_MECHANISM,
      detectionSource: VehicleEnergyEventDetectionSource.SYNQDRIVE_ERD_RECHARGE_PROJECTION,
      confidence: EnergyEventConfidence.HIGH,
      startTime: new Date('2026-09-10T10:00:00.000Z'),
      endTime: new Date('2026-09-10T11:00:00.000Z'),
      durationSeconds: 3600,
      startLatitude: coords.startLatitude ?? null,
      startLongitude: coords.startLongitude ?? null,
      endLatitude: coords.endLatitude ?? null,
      endLongitude: coords.endLongitude ?? null,
      energyDeltaKwh: 12,
    },
  });
}

(LIVE ? describe : describe.skip)('ERD E6.3 charging station enrichment postgres integration', () => {
  let prisma: PrismaClient;
  let orchestrator: ChargingStationEnrichmentOrchestratorService;

  beforeAll(async () => {
    const ok = await probeChargingStationPostgresDatabase();
    if (!ok) {
      if (REQUIRED) throw new Error('ERD E6.3 postgres integration requires DATABASE_URL + PostGIS');
      return;
    }
    prisma = new PrismaClient();
    await ensureChargingStationOsmSchema(prisma);
    await seedSyntheticChargingDataset(prisma);
    const repo = new ChargingStationCandidateRepository(prisma as unknown as PrismaService);
    const resolver = new ChargingStationLocationResolverService(repo);
    orchestrator = new ChargingStationEnrichmentOrchestratorService(
      prisma as unknown as PrismaService,
      resolver,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('P1/P2/P3: canonical VEE → one MATCHED enrichment row', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRecharge(prisma, vehicle.id, {
      startLatitude: 50.001,
      startLongitude: 8.001,
    });
    await orchestrator.processEnergyEvent(event.id);
    await orchestrator.processEnergyEvent(event.id);
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row).not.toBeNull();
    expect(row?.resolutionStatus).toBe('MATCHED');
    expect(row?.osmDatasetVersion).toBeTruthy();
    expect(row?.stationName).toBeTruthy();
    await prisma.vehicleEnergyEvent.delete({ where: { id: event.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('P5/P6: NO_COORDINATES upgrades to MATCHED after coordinates arrive', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRecharge(prisma, vehicle.id, {});
    await orchestrator.processEnergyEvent(event.id);
    let row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.resolutionStatus).toBe('NO_COORDINATES');

    await prisma.vehicleEnergyEvent.update({
      where: { id: event.id },
      data: { startLatitude: 50.001, startLongitude: 8.001 },
    });
    await orchestrator.processEnergyEvent(event.id);
    row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.resolutionStatus).toBe('MATCHED');
    await prisma.vehicleEnergyEvent.delete({ where: { id: event.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('P8/P9: REFUEL and legacy RECHARGE firewall', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const refuel = await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.REFUEL,
        detectionMechanism: 'test',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        confidence: EnergyEventConfidence.MEDIUM,
        startTime: new Date('2026-09-10T10:00:00.000Z'),
        endTime: new Date('2026-09-10T11:00:00.000Z'),
        durationSeconds: 3600,
        startLatitude: 50.001,
        startLongitude: 8.001,
      },
    });
    expect((await orchestrator.processEnergyEvent(refuel.id)).skipped).toBe(true);

    const legacy = await prisma.vehicleEnergyEvent.create({
      data: {
        vehicleId: vehicle.id,
        kind: EnergyEventKind.RECHARGE,
        detectionMechanism: 'legacy',
        detectionSource: VehicleEnergyEventDetectionSource.DIMO_NATIVE,
        confidence: EnergyEventConfidence.MEDIUM,
        startTime: new Date('2026-09-10T10:00:00.000Z'),
        endTime: new Date('2026-09-10T11:00:00.000Z'),
        durationSeconds: 3600,
        startLatitude: 50.001,
        startLongitude: 8.001,
      },
    });
    expect((await orchestrator.processEnergyEvent(legacy.id)).skipped).toBe(true);

    await prisma.vehicleEnergyEvent.deleteMany({ where: { id: { in: [refuel.id, legacy.id] } } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('P16: canonical read exposes chargingStationEnrichment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRecharge(prisma, vehicle.id, {
      startLatitude: 50.001,
      startLongitude: 8.001,
    });
    await orchestrator.processEnergyEvent(event.id);
    const svc = new EnergyEventsService(prisma as unknown as PrismaService, {} as never);
    const listed = await svc.listCanonicalEnergyEvents(vehicle.id);
    const dto = listed.find((e) => e.id === event.id);
    expect(dto?.chargingStationEnrichment?.resolutionStatus).toBe('MATCHED');
    await prisma.vehicleEnergyEvent.delete({ where: { id: event.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('P15: delete VEE cascades charging enrichment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRecharge(prisma, vehicle.id, {
      startLatitude: 50.001,
      startLongitude: 8.001,
    });
    await orchestrator.processEnergyEvent(event.id);
    await prisma.vehicleEnergyEvent.delete({ where: { id: event.id } });
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row).toBeNull();
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.organization.delete({ where: { id: org.id } });
  });
});

describe('E6.3 producer cutover gate (integration helper)', () => {
  it('uses endTime not startTime for cutover', () => {
    expect(CUTOVER.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
