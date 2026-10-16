import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION } from '../generalized-evidence.constants';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import { probePostgresDatabase } from '../../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { LongitudinalProfileMaterializationRepository } from '../rest-session-features/longitudinal/longitudinal-profile-materialization.repository';
import { LongitudinalSourceEvidenceAckRepository } from '../rest-session-features/longitudinal/longitudinal-source-evidence-ack.repository';
import { LongitudinalProfileRevisionInspectionService } from '../rest-session-features/longitudinal/longitudinal-profile-revision-inspection.service';
import { LvMeasuredIntelligenceReadService } from './lv-measured-intelligence-read.service';

const LIVE = process.env.BATTERY_V2_LV_MEASURED_INTELLIGENCE_INTEGRATION === '1';

async function createOrgVehicle(prisma: PrismaClient) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `G5C-N13 ${suffix}`,
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
      'ICE',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${`N13-${suffix}`.slice(0, 32)},
      NOW(),
      NOW()
    )
  `;
  return { organizationId: org.id, vehicleId };
}

(LIVE ? describe : describe.skip)('LvMeasuredIntelligenceReadService postgres', () => {
  let prisma: PrismaClient;
  let service: LvMeasuredIntelligenceReadService;
  let dbOk = false;

  beforeAll(async () => {
    dbOk = await probePostgresDatabase();
    if (!dbOk) return;
    prisma = new PrismaClient();
    const materializationRepository = new LongitudinalProfileMaterializationRepository(
      prisma as unknown as PrismaService,
    );
    const ackRepository = new LongitudinalSourceEvidenceAckRepository(prisma as unknown as PrismaService);
    const d4 = new LongitudinalProfileRevisionInspectionService(materializationRepository, ackRepository);
    service = new LvMeasuredIntelligenceReadService(prisma as unknown as PrismaService, d4);
  });

  afterAll(async () => {
    await prisma?.$disconnect().catch(() => undefined);
  });

  it('dedupes duplicate GE rows per source measurement in historical read', async () => {
    if (!dbOk) return;
    const { organizationId, vehicleId } = await createOrgVehicle(prisma);
    const observedAt = new Date('2026-02-01T12:00:00Z');
    const meas = await prisma.batteryMeasurement.create({
      data: {
        organizationId,
        vehicleId,
        scope: BatteryEvidenceScope.LV,
        type: BatteryMeasurementType.LIVE_VOLTAGE,
        numericValue: 12.4,
        unit: 'V',
        quality: BatteryMeasurementQuality.VALID,
        observedAt,
        receivedAt: observedAt,
        providerTimestamp: observedAt,
        idempotencyKey: `meas:${randomUUID()}`,
      },
    });

    const base = {
      organizationId,
      vehicleId,
      sourceMeasurementId: meas.id,
      ingestedAt: observedAt,
      evidenceClass: BatteryGeneralizedEvidenceClass.PARKED_REST_CANDIDATE,
      evidenceConfidence: 'MEDIUM' as const,
      classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
      voltage: 12.4,
      voltageObservedAt: observedAt,
      providerObservationAt: observedAt,
      providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      atomicClaim: false,
    };

    await prisma.batteryGeneralizedEvidenceObservation.create({
      data: {
        ...base,
        id: randomUUID(),
        idempotencyKey: `ge:${randomUUID()}`,
      },
    });
    await prisma.batteryGeneralizedEvidenceObservation.create({
      data: {
        ...base,
        id: randomUUID(),
        idempotencyKey: `ge:${randomUUID()}`,
        voltage: 12.5,
      },
    });

    const result = await service.readVehicleIntelligence({ organizationId, vehicleId });
    expect(result.historicalMeasured).toHaveLength(1);
    expect(result.historicalMeasured[0].sourceMeasurementId).toBe(meas.id);
    expect(result.historicalMeasured[0].voltageV).toBe(12.5);
    expect(result.scientificBoundary.batteryHealthAssessment).toBe('NOT_ASSESSED');
  });
});
