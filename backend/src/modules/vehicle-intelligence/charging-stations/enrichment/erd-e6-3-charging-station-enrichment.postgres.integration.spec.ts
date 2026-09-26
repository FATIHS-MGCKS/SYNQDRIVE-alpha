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
import { isTrustedChargingStationAssignment } from '../enrichment/charging-station-enrichment-trust.policy';
import {
  buildChargingStationEnrichmentInputFingerprint,
} from '../enrichment/charging-station-enrichment-fingerprint.util';
import { deriveCanonicalChargingStationEnrichmentCoordinate } from '../enrichment/derive-canonical-charging-station-enrichment-coordinate';
import { ChargingStationEnrichmentProducerService } from '../enrichment/charging-station-enrichment-producer.service';
import { isChargingStationEnrichmentEventAfterCutover } from '../enrichment/charging-station-enrichment-cutover.util';
import { EnergyEventsService } from '../../energy-events/energy-events.service';
import {
  E6_3_AMBIGUOUS_LAT,
  E6_3_AMBIGUOUS_LON,
  E6_3_CUTOVER_ISO,
  E6_3_MATCH_LAT,
  E6_3_MATCH_LON,
  E6_3_NOT_FOUND_LAT,
  E6_3_NOT_FOUND_LON,
  E6_3_POST_CUTOVER_END,
  E6_3_PRE_CUTOVER_END,
  bootstrapE6_3PostgresOrchestrator,
  cleanupOrgVehicle,
  createCanonicalRechargeEvent,
  createE6_3EnrichmentConfig,
  createE6_3Producer,
  seedOrgVehicle,
  CHARGING_STATION_RESOLVER_VERSION,
} from '../testing/erd-e6-3-charging-enrichment.integration.harness';
import type { ChargingStationEnrichmentOrchestratorService } from '../enrichment/charging-station-enrichment-orchestrator.service';
import { ChargingStationEnrichmentOrchestratorService as OrchestratorService } from '../enrichment/charging-station-enrichment-orchestrator.service';
import { Queue } from 'bullmq';

const LIVE = process.env.ERD_E6_3_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.ERD_E6_3_POSTGRES_REQUIRED === '1';

(LIVE ? describe : describe.skip)('ERD E6.3 charging enrichment postgres matrix (P1–P20)', () => {
  let prisma: PrismaClient;
  let orchestrator: ChargingStationEnrichmentOrchestratorService;
  let resolver: ChargingStationLocationResolverService;

  beforeAll(async () => {
    try {
      const boot = await bootstrapE6_3PostgresOrchestrator();
      prisma = boot.prisma;
      orchestrator = boot.orchestrator;
      resolver = boot.resolver;
    } catch (error) {
      if (REQUIRED) throw error;
      throw error;
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('P1/P2/P3: canonical enrichment + MATCHED metadata + idempotent row', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    await orchestrator.processEnergyEvent(event.id);
    const rows = await prisma.vehicleEnergyEventChargingStationEnrichment.findMany({
      where: { energyEventId: event.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolutionStatus).toBe('MATCHED');
    expect(rows[0]?.osmDatasetVersion).toBeTruthy();
    expect(rows[0]?.stationName).toBeTruthy();
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P4: coordinate change updates same enrichment row', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const first = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    await prisma.vehicleEnergyEvent.update({
      where: { id: event.id },
      data: { startLatitude: 51.0, startLongitude: 9.0 },
    });
    await orchestrator.processEnergyEvent(event.id);
    const second = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(second?.id).toBe(first?.id);
    expect(second?.inputFingerprint).not.toBe(first?.inputFingerprint);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P5/P6: NO_COORDINATES then late coordinate upgrade to MATCHED', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {});
    await orchestrator.processEnergyEvent(event.id);
    expect(
      (
        await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
          where: { energyEventId: event.id },
        })
      )?.resolutionStatus,
    ).toBe('NO_COORDINATES');
    await prisma.vehicleEnergyEvent.update({
      where: { id: event.id },
      data: { startLatitude: E6_3_MATCH_LAT, startLongitude: E6_3_MATCH_LON },
    });
    await orchestrator.processEnergyEvent(event.id);
    expect(
      (
        await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
          where: { energyEventId: event.id },
        })
      )?.resolutionStatus,
    ).toBe('MATCHED');
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P7: INCONSISTENT_COORDINATES without station assignment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: 50,
      startLongitude: 8,
      endLatitude: 51,
      endLongitude: 9,
    });
    await orchestrator.processEnergyEvent(event.id);
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.resolutionStatus).toBe('INCONSISTENT_COORDINATES');
    expect(row?.osmId).toBeNull();
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
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
        endTime: E6_3_POST_CUTOVER_END,
        durationSeconds: 3600,
        startLatitude: E6_3_MATCH_LAT,
        startLongitude: E6_3_MATCH_LON,
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
        endTime: E6_3_POST_CUTOVER_END,
        durationSeconds: 3600,
        startLatitude: E6_3_MATCH_LAT,
        startLongitude: E6_3_MATCH_LON,
      },
    });
    expect((await orchestrator.processEnergyEvent(legacy.id)).skipped).toBe(true);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [refuel.id, legacy.id]);
  });

  it('P10: AMBIGUOUS persists no chosen station assignment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_AMBIGUOUS_LAT,
      startLongitude: E6_3_AMBIGUOUS_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.resolutionStatus).toBe('AMBIGUOUS');
    expect(row?.osmId).toBeNull();
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P11: LOW match is untrusted in API projection', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await prisma.vehicleEnergyEventChargingStationEnrichment.create({
      data: {
        energyEventId: event.id,
        processingStatus: 'COMPLETED',
        resolutionStatus: 'MATCHED',
        matchConfidence: 'LOW',
        matchScore: 10,
        inputFingerprint: 'test-low',
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        osmId: '1',
        stationName: 'Low',
      },
    });
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(
      isTrustedChargingStationAssignment({
        resolutionStatus: row?.resolutionStatus,
        matchConfidence: row?.matchConfidence,
      }),
    ).toBe(false);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P12/P13: datasetVersion and connector metadata on MATCHED row', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.osmDatasetVersion).toBeTruthy();
    expect(row?.connectors).toBeTruthy();
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P14: fuel enrichment table untouched by charging orchestrator', async () => {
    const fuelBefore = await prisma.vehicleEnergyEventFuelStationEnrichment.count();
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    expect(await prisma.vehicleEnergyEventFuelStationEnrichment.count()).toBe(fuelBefore);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P15: delete VEE cascades charging enrichment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    await prisma.vehicleEnergyEvent.delete({ where: { id: event.id } });
    expect(
      await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      }),
    ).toBeNull();
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, []);
  });

  it('P16/P17: canonical and raw reads expose chargingStationEnrichment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const svc = new EnergyEventsService(prisma as unknown as PrismaService, {} as never);
    const canonical = await svc.listCanonicalEnergyEvents(vehicle.id);
    expect(canonical.find((e) => e.id === event.id)?.chargingStationEnrichment?.resolutionStatus).toBe(
      'MATCHED',
    );
    const raw = await svc.listEnergyEvents(vehicle.id);
    expect(raw.find((e) => e.id === event.id)?.chargingStationEnrichment?.resolutionStatus).toBe(
      'MATCHED',
    );
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P18: product dedupe still surfaces canonical row with enrichment', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const svc = new EnergyEventsService(prisma as unknown as PrismaService, {} as never);
    const listed = await svc.listCanonicalEnergyEvents(vehicle.id);
    expect(listed.filter((e) => e.id === event.id)).toHaveLength(1);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P19: orchestrator does not mutate VEE identity fields', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    const before = await prisma.vehicleEnergyEvent.findUnique({ where: { id: event.id } });
    await orchestrator.processEnergyEvent(event.id);
    const after = await prisma.vehicleEnergyEvent.findUnique({ where: { id: event.id } });
    expect(after?.detectionSource).toBe(before?.detectionSource);
    expect(after?.kind).toBe(before?.kind);
    expect(after?.endTime.toISOString()).toBe(before?.endTime.toISOString());
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P20: two clients converge to one enrichment row', async () => {
    const prismaB = new PrismaClient();
    const repoB = new ChargingStationCandidateRepository(prismaB as unknown as PrismaService);
    const resolverB = new ChargingStationLocationResolverService(repoB);
    const orchestratorB = new OrchestratorService(
      prismaB as unknown as PrismaService,
      resolverB,
    );
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    try {
      await Promise.all([
        orchestrator.processEnergyEvent(event.id),
        orchestratorB.processEnergyEvent(event.id),
      ]);
    } finally {
      await prismaB.$disconnect().catch(() => undefined);
    }
    expect(
      await prisma.vehicleEnergyEventChargingStationEnrichment.count({
        where: { energyEventId: event.id },
      }),
    ).toBe(1);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P-NOT_FOUND: far coordinate resolves NOT_FOUND terminal row', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_NOT_FOUND_LAT,
      startLongitude: E6_3_NOT_FOUND_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.resolutionStatus).toBe('NOT_FOUND');
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P-CUTOVER: endTime before cutover blocked for producer eligibility', async () => {
    expect(
      isChargingStationEnrichmentEventAfterCutover(
        E6_3_PRE_CUTOVER_END,
        new Date(E6_3_CUTOVER_ISO),
      ),
    ).toBe(false);
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
      endTime: E6_3_PRE_CUTOVER_END,
    });
    const producer = createE6_3Producer({ add: jest.fn() } as unknown as Queue, prisma, {
      ...createE6_3EnrichmentConfig(),
      enabled: true,
    });
    const outcome = await producer.enqueueForEventOutcome(event);
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') {
      expect(outcome.reason).toBe('before_cutover');
    }
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });

  it('P-ERROR: resolver ERROR persists retryable row then succeeds on retry', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    const originalResolve = resolver.resolve.bind(resolver);
    let calls = 0;
    const spy = jest.spyOn(resolver, 'resolve').mockImplementation((input) => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          status: 'ERROR',
          errorMessage: 'integration-resolver-error',
          diagnostics: { reason: 'test' },
        } as never);
      }
      return originalResolve(input);
    });
    try {
      await expect(orchestrator.processEnergyEvent(event.id)).rejects.toThrow();
      const errorRow = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      });
      expect(errorRow?.resolutionStatus).toBe('ERROR');
      await orchestrator.processEnergyEvent(event.id);
      const matched = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
        where: { energyEventId: event.id },
      });
      expect(matched?.resolutionStatus).toBe('MATCHED');
    } finally {
      spy.mockRestore();
      await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
    }
  });

  it('P-FINGERPRINT: same fingerprint terminal skip on reprocess', async () => {
    const { org, vehicle } = await seedOrgVehicle(prisma);
    const event = await createCanonicalRechargeEvent(prisma, vehicle.id, {
      startLatitude: E6_3_MATCH_LAT,
      startLongitude: E6_3_MATCH_LON,
    });
    await orchestrator.processEnergyEvent(event.id);
    const second = await orchestrator.processEnergyEvent(event.id);
    expect(second.skipped).toBe(true);
    const outcome = deriveCanonicalChargingStationEnrichmentCoordinate(event);
    const fp = buildChargingStationEnrichmentInputFingerprint({
      energyEventId: event.id,
      coordinateOutcome: outcome,
    });
    const row = await prisma.vehicleEnergyEventChargingStationEnrichment.findUnique({
      where: { energyEventId: event.id },
    });
    expect(row?.inputFingerprint).toBe(fp);
    await cleanupOrgVehicle(prisma, org.id, vehicle.id, [event.id]);
  });
});
