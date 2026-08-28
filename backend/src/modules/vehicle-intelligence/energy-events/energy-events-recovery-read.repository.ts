import { PrismaClient } from '@prisma/client';
import type { RecoveryVehicleInput } from './energy-events-recovery-runner';
import {
  QUICK_MODE_AUDIT_FLEET_PROFILES,
  type AuditedFleetSignalProfile,
} from './energy-events-recovery.constants';
import { resolveQuickModeProfile } from './energy-events-recovery-fleet-inference';
import {
  resolveEnergyMechanismApplicability,
  type RecoveryVehicleDbLoad,
} from './energy-events-recovery-capability';

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
  loadRecoveryVehicleDbRows(options: {
    outageStart: Date;
    recoveryCutoff: Date;
  }): Promise<RecoveryVehicleDbLoad[]>;
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

function mapDbRowToRecoveryVehicleLoad(
  row: {
    id: string;
    licensePlate: string | null;
    vehicleName: string | null;
    hardwareType: string | null;
    fuelType: string;
    dimoVehicle: { tokenId: number } | null;
    energyEvents: RecoveryExistingEnergyEvent[];
    vehicleBatteryCapabilities: Array<{
      signalKey: string;
      status: RecoveryVehicleDbLoad['batteryCapabilities'][number]['status'];
    }>;
  },
): RecoveryVehicleDbLoad | null {
  const tokenId = row.dimoVehicle?.tokenId;
  if (tokenId == null) return null;

  return {
    vehicleId: row.id,
    label: row.licensePlate ?? row.vehicleName ?? `vehicle-${tokenId}`,
    tokenId,
    provider: row.hardwareType ?? 'LTE_R1',
    fuelType: row.fuelType,
    dimoAccessAvailable: true,
    existingEvents: row.energyEvents,
    batteryCapabilities: row.vehicleBatteryCapabilities,
  };
}

export function createPrismaRecoveryReadRepository(
  prisma: PrismaClient,
): EnergyEventsRecoveryReadRepository {
  return {
    async loadRecoveryVehicleDbRows({ outageStart, recoveryCutoff }) {
      const rows = await prisma.vehicle.findMany({
        where: { dimoVehicle: { isNot: null } },
        select: {
          id: true,
          licensePlate: true,
          vehicleName: true,
          hardwareType: true,
          fuelType: true,
          dimoVehicle: { select: { tokenId: true } },
          energyEvents: {
            where: { startTime: { gte: outageStart, lt: recoveryCutoff } },
            select: EXISTING_EVENT_SELECT,
          },
          vehicleBatteryCapabilities: {
            select: {
              signalKey: true,
              status: true,
            },
          },
        },
        orderBy: { licensePlate: 'asc' },
      });

      return rows
        .map((row) => mapDbRowToRecoveryVehicleLoad(row as never))
        .filter((row): row is RecoveryVehicleDbLoad => row != null);
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
  return QUICK_MODE_AUDIT_FLEET_PROFILES.map((profile) => {
    const applicability = resolveEnergyMechanismApplicability(profile.powertrain);
    const fuelApplicable = applicability.refuel !== 'NOT_APPLICABLE';
    const rechargeApplicable = applicability.recharge !== 'NOT_APPLICABLE';
    return {
      vehicleId: `dry-run-token-${profile.tokenId}`,
      label: profile.label,
      tokenId: profile.tokenId,
      provider: profile.provider,
      powertrain: profile.powertrain,
      relativeFuelAvailable: fuelApplicable && profile.relativeFuel,
      absoluteFuelAvailable: fuelApplicable && profile.absoluteFuel,
      rechargeSocAvailable: rechargeApplicable && profile.rechargeSoc,
      capabilityLookupStatus: 'ok' as const,
      dimoAccessAvailable: dimoAccessByTokenId[profile.tokenId] ?? false,
      dbVehicleMapped: false,
      existingEvents: [],
      capabilityEvidence: {
        applicability,
        confirmedFuelSources:
          fuelApplicable && (profile.relativeFuel || profile.absoluteFuel)
            ? (['SUPPLEMENTAL_WINDOW_EVENTS'] as const).slice()
            : [],
        confirmedRechargeSources:
          rechargeApplicable && profile.rechargeSoc
            ? (['SUPPLEMENTAL_WINDOW_EVENTS'] as const).slice()
            : [],
        suppressedFuelSources: [],
        suppressedRechargeSources: [],
        availableSignalsProbeStatus: 'not_attempted' as const,
      },
    };
  });
}

export function mergeAuditedFleetIntoDbVehicles(
  dbVehicles: RecoveryVehicleInput[],
  dimoAccessByTokenId: Record<number, boolean>,
  fullMode: boolean,
): RecoveryVehicleInput[] {
  if (fullMode) {
    return dbVehicles.map((vehicle) => ({
      ...vehicle,
      dbVehicleMapped: true,
      dimoAccessAvailable:
        dimoAccessByTokenId[vehicle.tokenId] ?? vehicle.dimoAccessAvailable,
    }));
  }

  const byToken = new Map(
    dbVehicles.map((vehicle) => [
      vehicle.tokenId,
      {
        ...vehicle,
        dbVehicleMapped: true,
        dimoAccessAvailable:
          dimoAccessByTokenId[vehicle.tokenId] ?? vehicle.dimoAccessAvailable,
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
      existing.capabilityLookupStatus = 'ok';
      existing.capabilityEvidence = vehicle.capabilityEvidence;
      existing.dbVehicleMapped = true;
      continue;
    }

    byToken.set(vehicle.tokenId, vehicle);
  }

  return [...byToken.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveQuickProfileCapabilities(
  tokenId: number,
): Pick<
  AuditedFleetSignalProfile,
  'relativeFuel' | 'absoluteFuel' | 'rechargeSoc' | 'powertrain' | 'provider'
> | null {
  const quickProfile = resolveQuickModeProfile(
    tokenId,
    QUICK_MODE_AUDIT_FLEET_PROFILES,
  );
  if (!quickProfile) return null;
  return quickProfile;
}
