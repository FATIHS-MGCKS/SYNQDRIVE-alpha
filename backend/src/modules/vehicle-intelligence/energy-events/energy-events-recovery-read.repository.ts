import { PrismaClient } from '@prisma/client';
import type { RecoveryVehicleInput } from './energy-events-recovery-runner';
import {
  QUICK_MODE_AUDIT_FLEET_PROFILES,
  type AuditedFleetSignalProfile,
} from './energy-events-recovery.constants';
import {
  inferFleetCapabilitiesFromEvents,
  resolveQuickModeProfile,
} from './energy-events-recovery-fleet-inference';

export type DbComparisonStatus = 'ok' | 'DB_COMPARISON_UNAVAILABLE';

export interface RecoveryExistingEnergyEvent {
  id: string;
  dimoSegmentId: string;
  kind: string;
  detectionMechanism: string;
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  rawDetectionMeta: unknown;
}

export interface EnergyEventsRecoveryReadRepository {
  loadVehiclesForRecovery(options: {
    outageStart: Date;
    recoveryCutoff: Date;
  }): Promise<RecoveryVehicleInput[]>;
}

const EXISTING_EVENT_SELECT = {
  id: true,
  dimoSegmentId: true,
  kind: true,
  detectionMechanism: true,
  startTime: true,
  endTime: true,
  durationSeconds: true,
  startLatitude: true,
  startLongitude: true,
  endLatitude: true,
  endLongitude: true,
  fuelDeltaLiters: true,
  fuelDeltaPercent: true,
  socDeltaPercent: true,
  energyDeltaKwh: true,
  odometerStartKm: true,
  odometerEndKm: true,
  confidence: true,
  rawDetectionMeta: true,
} as const;

function resolveSignalProfile(
  tokenId: number,
  events: RecoveryExistingEnergyEvent[],
): Pick<
  AuditedFleetSignalProfile,
  'relativeFuel' | 'absoluteFuel' | 'rechargeSoc' | 'powertrain' | 'provider'
> {
  const quickProfile = resolveQuickModeProfile(
    tokenId,
    QUICK_MODE_AUDIT_FLEET_PROFILES,
  );
  if (quickProfile) {
    return quickProfile;
  }
  return {
    provider: 'LTE_R1',
    ...inferFleetCapabilitiesFromEvents(events),
  };
}

function mapDbRowToRecoveryVehicle(
  row: {
    id: string;
    licensePlate: string | null;
    vehicleName: string | null;
    hardwareType: string | null;
    dimoVehicle: { tokenId: number } | null;
    energyEvents: RecoveryExistingEnergyEvent[];
  },
  dimoAccessAvailable: boolean,
): RecoveryVehicleInput | null {
  const tokenId = row.dimoVehicle?.tokenId;
  if (tokenId == null) return null;

  const profile = resolveSignalProfile(tokenId, row.energyEvents);
  return {
    vehicleId: row.id,
    label: row.licensePlate ?? row.vehicleName ?? `vehicle-${tokenId}`,
    tokenId,
    provider: row.hardwareType ?? profile.provider,
    powertrain: profile.powertrain ?? 'UNKNOWN',
    relativeFuelAvailable: profile.relativeFuel,
    absoluteFuelAvailable: profile.absoluteFuel,
    rechargeSocAvailable: profile.rechargeSoc,
    dimoAccessAvailable,
    dbVehicleMapped: true,
    existingEvents: row.energyEvents,
  };
}

export function createPrismaRecoveryReadRepository(
  prisma: PrismaClient,
): EnergyEventsRecoveryReadRepository {
  return {
    async loadVehiclesForRecovery({ outageStart, recoveryCutoff }) {
      const rows = await prisma.vehicle.findMany({
        where: { dimoVehicle: { isNot: null } },
        select: {
          id: true,
          licensePlate: true,
          vehicleName: true,
          hardwareType: true,
          dimoVehicle: { select: { tokenId: true } },
          energyEvents: {
            where: { startTime: { gte: outageStart, lt: recoveryCutoff } },
            select: EXISTING_EVENT_SELECT,
          },
        },
        orderBy: { licensePlate: 'asc' },
      });

      return rows
        .map((row) => mapDbRowToRecoveryVehicle(row as never, true))
        .filter((row): row is RecoveryVehicleInput => row != null);
    },
  };
}

const FORBIDDEN_MUTATIONS = [
  'create',
  'update',
  'upsert',
  'delete',
  'deleteMany',
  'updateMany',
  'createMany',
] as const;

export function createMutationGuardedPrismaClient(
  prisma: PrismaClient,
): PrismaClient {
  const guarded = prisma as PrismaClient & {
    __recoveryMutationGuardInstalled?: boolean;
  };
  if (guarded.__recoveryMutationGuardInstalled) {
    return guarded;
  }

  for (const method of FORBIDDEN_MUTATIONS) {
    installMutationGuard(
      prisma.vehicleEnergyEvent as unknown as Record<string, unknown>,
      method,
    );
  }

  guarded.__recoveryMutationGuardInstalled = true;
  return guarded;
}

function installMutationGuard(
  target: Record<string, unknown>,
  method: string,
): void {
  const original = target[method];
  if (typeof original !== 'function') return;

  Object.defineProperty(target, method, {
    configurable: true,
    value: (...args: unknown[]) => {
      throw new Error(
        `FORBIDDEN: vehicleEnergyEvent.${method} called during recovery dry-run`,
      );
    },
  });
}

export function buildFleetFallbackVehicles(
  dimoAccessByTokenId: Record<number, boolean>,
): RecoveryVehicleInput[] {
  return QUICK_MODE_AUDIT_FLEET_PROFILES.map((profile) => ({
    vehicleId: `dry-run-token-${profile.tokenId}`,
    label: profile.label,
    tokenId: profile.tokenId,
    provider: profile.provider,
    powertrain: profile.powertrain,
    relativeFuelAvailable: profile.relativeFuel,
    absoluteFuelAvailable: profile.absoluteFuel,
    rechargeSocAvailable: profile.rechargeSoc,
    dimoAccessAvailable: dimoAccessByTokenId[profile.tokenId] ?? false,
    dbVehicleMapped: false,
    existingEvents: [],
  }));
}

export function mergeAuditedFleetIntoDbVehicles(
  dbVehicles: RecoveryVehicleInput[],
  dimoAccessByTokenId: Record<number, boolean>,
  fullMode: boolean,
): RecoveryVehicleInput[] {
  const byToken = new Map(
    dbVehicles.map((vehicle) => [
      vehicle.tokenId,
      {
        ...vehicle,
        dbVehicleMapped: true,
        dimoAccessAvailable: dimoAccessByTokenId[vehicle.tokenId] ?? vehicle.dimoAccessAvailable,
      },
    ]),
  );
  const fallback = buildFleetFallbackVehicles(dimoAccessByTokenId);

  for (const vehicle of fallback) {
    const existing = byToken.get(vehicle.tokenId);
    if (existing) {
      existing.dimoAccessAvailable = dimoAccessByTokenId[vehicle.tokenId] ?? false;
      existing.relativeFuelAvailable = vehicle.relativeFuelAvailable;
      existing.absoluteFuelAvailable = vehicle.absoluteFuelAvailable;
      existing.rechargeSocAvailable = vehicle.rechargeSocAvailable;
      existing.powertrain = vehicle.powertrain;
      existing.dbVehicleMapped = true;
      continue;
    }

    if (fullMode) {
      byToken.set(vehicle.tokenId, {
        ...vehicle,
        dbVehicleMapped: false,
      });
      continue;
    }

    byToken.set(vehicle.tokenId, vehicle);
  }

  return [...byToken.values()].sort((a, b) => a.label.localeCompare(b.label));
}
