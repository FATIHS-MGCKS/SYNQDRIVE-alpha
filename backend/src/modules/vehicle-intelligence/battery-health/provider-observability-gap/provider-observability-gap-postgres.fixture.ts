import { randomUUID } from 'crypto';
import {
  BatteryDriveProfile,
  BatteryEvidenceScope,
  BatteryGeneralizedEvidenceClass,
  BatteryMeasurementQuality,
  BatteryMeasurementType,
  BatteryProviderObservabilityGapStatus,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
  PrismaClient,
} from '@prisma/client';
import { BatteryRestSessionService } from '../generalized-evidence/battery-rest-session.service';
import { GeneralizedEvidenceRepository } from '../generalized-evidence/generalized-evidence.repository';
import { GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION } from '../generalized-evidence/generalized-evidence.constants';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';
import { ProviderObservabilityGapRepository } from './provider-observability-gap.repository';
import { ProviderObservabilityGapService } from './provider-observability-gap.service';
import {
  PROVIDER_GAP_CONTRACT_VERSION,
  PROVIDER_GAP_SIGNAL_FAMILY,
} from './provider-observability-gap.constants';
import { buildProviderGapOpenIdempotencyKey } from './provider-observability-gap-idempotency.policy';

export async function probePostgresDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export type GapPostgresFixture = {
  organizationId: string;
  vehicleId: string;
  prisma: PrismaClient;
  repository: ProviderObservabilityGapRepository;
  gapService: ProviderObservabilityGapService;
  restSessions: BatteryRestSessionService;
  geRepository: GeneralizedEvidenceRepository;
};

export async function createGapPostgresFixture(prisma: PrismaClient): Promise<GapPostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const org = await prisma.organization.create({
    data: {
      companyName: `Gap §13.2 Org ${suffix}`,
      businessType: 'FLEET',
      status: 'ACTIVE',
    },
  });
  const organizationId = org.id;
  const vehicleId = randomUUID();
  const vin = `VIN${suffix}`.slice(0, 17).padEnd(17, '0');
  const plate = `G13-${suffix}`;
  await prisma.$executeRaw`
    INSERT INTO vehicles (
      id, organization_id, vin, make, model, year, fuel_type, hardware_type, status,
      license_plate, created_at, updated_at
    ) VALUES (
      ${vehicleId}::uuid,
      ${organizationId}::uuid,
      ${vin},
      'Test',
      'ICE',
      2024,
      'GASOLINE'::"FuelType",
      'LTE_R1'::"HardwareType",
      'AVAILABLE'::"VehicleStatus",
      ${plate},
      NOW(),
      NOW()
    )
  `;

  const repository = new ProviderObservabilityGapRepository(prisma as never);
  const geRepository = new GeneralizedEvidenceRepository(prisma as never);
  const restSessions = new BatteryRestSessionService(geRepository);
  const batteryPolicy = {
    resolveForVehicle: jest.fn().mockResolvedValue({ driveProfile: BatteryDriveProfile.ICE }),
  };
  const gapService = new ProviderObservabilityGapService(
    prisma as never,
    repository,
    batteryPolicy as never,
  );

  return {
    organizationId,
    vehicleId,
    prisma,
    repository,
    gapService,
    restSessions,
    geRepository,
  };
}

export async function createLiveVoltageMeasurement(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    observedAt: Date;
    providerTimestamp?: Date | null;
    receivedAt?: Date;
    numericValue?: number;
  },
) {
  return prisma.batteryMeasurement.create({
    data: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      scope: BatteryEvidenceScope.LV,
      type: BatteryMeasurementType.LIVE_VOLTAGE,
      numericValue: input.numericValue ?? 12.4,
      unit: 'V',
      quality: BatteryMeasurementQuality.VALID,
      observedAt: input.observedAt,
      receivedAt: input.receivedAt ?? new Date(input.observedAt.getTime() + 5_000),
      providerTimestamp: input.providerTimestamp ?? input.observedAt,
      idempotencyKey: `meas:${randomUUID()}`,
    },
  });
}

export async function openProviderGapAtT1(
  repository: ProviderObservabilityGapRepository,
  input: {
    organizationId: string;
    vehicleId: string;
    t1: Date;
    t1MeasurementId: string;
    gapDetectedAt?: Date;
    lastKnownEvidenceClass?: BatteryGeneralizedEvidenceClass;
  },
) {
  const idempotencyKey = buildProviderGapOpenIdempotencyKey({
    organizationId: input.organizationId,
    vehicleId: input.vehicleId,
    lastFreshProviderAt: input.t1,
  });
  const result = await repository.openOrExtendGap({
    organization: { connect: { id: input.organizationId } },
    vehicle: { connect: { id: input.vehicleId } },
    contractVersion: PROVIDER_GAP_CONTRACT_VERSION,
    signalFamily: PROVIDER_GAP_SIGNAL_FAMILY,
    status: BatteryProviderObservabilityGapStatus.OPEN,
    gapDetectedAt: input.gapDetectedAt ?? new Date(input.t1.getTime() + 3600_000),
    lastFreshProviderAt: input.t1,
    lastFreshObservation: { connect: { id: input.t1MeasurementId } },
    lastKnownEvidenceClass: input.lastKnownEvidenceClass ?? BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
    idempotencyKey,
  });
  return result;
}

export async function persistGeneralizedEvidenceRow(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    vehicleId: string;
    sourceMeasurementId: string;
    evidenceClass: BatteryGeneralizedEvidenceClass;
    providerObservationAt: Date;
  },
) {
  return prisma.batteryGeneralizedEvidenceObservation.create({
    data: {
      id: randomUUID(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      sourceMeasurementId: input.sourceMeasurementId,
      ingestedAt: new Date(input.providerObservationAt.getTime() + 2_000),
      evidenceClass: input.evidenceClass,
      evidenceConfidence: 'MEDIUM',
      classificationVersion: GENERALIZED_EVIDENCE_CLASSIFICATION_VERSION,
      voltageObservedAt: input.providerObservationAt,
      providerObservationAt: input.providerObservationAt,
      providerTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
      stateCompleteness: BatteryShutdownStateCompleteness.COMPLETE,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
      atomicClaim: false,
      idempotencyKey: `gen-ev:${input.vehicleId}:${input.sourceMeasurementId}:${input.evidenceClass}`,
    },
  });
}

export function engineOffShutdownFields(t4: Date) {
  return {
    voltage: 12.3,
    voltageObservedAt: t4,
    voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    speedKmh: 0,
    speedObservedAt: t4,
    speedTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    ignitionOn: false,
    ignitionObservedAt: t4,
    ignitionTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    engineRunning: false,
    engineRunningObservedAt: t4,
    engineRunningTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    isLvCharging: false,
    isHvCharging: false,
    chargingContextObservedAt: t4,
    chargingContextTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    activeTrip: false,
    activeTripObservedAt: t4,
    activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,
    vehicleOnline: true,
    vehicleOnlineObservedAt: t4,
    providerLastSeenAt: t4,
  };
}

export async function cleanupGapFixture(prisma: PrismaClient, organizationId: string, vehicleId: string) {
  await prisma.batteryProviderObservabilityGap.deleteMany({ where: { organizationId } });
  await prisma.batteryGeneralizedEvidenceObservation.deleteMany({ where: { organizationId } });
  await prisma.batteryRestSession.deleteMany({ where: { organizationId } });
  await prisma.batteryMeasurement.deleteMany({ where: { organizationId } });
  await prisma.vehicle.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}
