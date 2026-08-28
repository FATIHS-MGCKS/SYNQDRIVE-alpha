import { PrismaClient } from '@prisma/client';
import type { RecoveryVehicleInput } from './energy-events-recovery-runner';
import {
  AUDITED_FLEET_SIGNAL_PROFILES,
  type AuditedFleetSignalProfile,
} from './energy-events-recovery.constants';

export type DbComparisonStatus = 'ok' | 'DB_COMPARISON_UNAVAILABLE';

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
  startTime: true,
  endTime: true,
  fuelDeltaLiters: true,
  fuelDeltaPercent: true,
  socDeltaPercent: true,
  energyDeltaKwh: true,
  confidence: true,
} as const;

function resolveSignalProfile(tokenId: number): AuditedFleetSignalProfile | undefined {
  return AUDITED_FLEET_SIGNAL_PROFILES.find((profile) => profile.tokenId === tokenId);
}

function mapDbRowToRecoveryVehicle(
  row: {
    id: string;
    licensePlate: string | null;
    vehicleName: string | null;
    hardwareType: string | null;
    dimoVehicle: { tokenId: number } | null;
    energyEvents: Array<{
      id: string;
      dimoSegmentId: string;
      kind: string;
      startTime: Date;
      endTime: Date;
      fuelDeltaLiters: number | null;
      fuelDeltaPercent: number | null;
      socDeltaPercent: number | null;
      energyDeltaKwh: number | null;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
  },
  dimoAccessAvailable: boolean,
): RecoveryVehicleInput | null {
  const tokenId = row.dimoVehicle?.tokenId;
  if (tokenId == null) return null;

  const profile = resolveSignalProfile(tokenId);
  return {
    vehicleId: row.id,
    label: row.licensePlate ?? row.vehicleName ?? `token-${tokenId}`,
    tokenId,
    provider: row.hardwareType ?? profile?.provider ?? 'LTE_R1',
    powertrain: profile?.powertrain ?? 'UNKNOWN',
    relativeFuelAvailable: profile?.relativeFuel ?? false,
    absoluteFuelAvailable: profile?.absoluteFuel ?? false,
    rechargeSocAvailable: profile?.rechargeSoc ?? false,
    dimoAccessAvailable,
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

/**
 * Wraps Prisma so any VehicleEnergyEvent mutation throws immediately.
 * Used to prove recovery dry-run paths cannot write.
 */
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
  return AUDITED_FLEET_SIGNAL_PROFILES.map((profile) => ({
    vehicleId: `dry-run-token-${profile.tokenId}`,
    label: profile.label,
    tokenId: profile.tokenId,
    provider: profile.provider,
    powertrain: profile.powertrain,
    relativeFuelAvailable: profile.relativeFuel,
    absoluteFuelAvailable: profile.absoluteFuel,
    rechargeSocAvailable: profile.rechargeSoc,
    dimoAccessAvailable: dimoAccessByTokenId[profile.tokenId] ?? false,
    existingEvents: [],
  }));
}
