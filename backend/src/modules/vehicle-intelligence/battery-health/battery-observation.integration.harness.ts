/**
 * In-memory persistence harness for battery provider observation integration tests.
 * Simulates Prisma constraints (HV idempotency key, evidence dedup tuple) without a DB.
 */

import { Prisma } from '@prisma/client';
import type {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  HvBatteryHealthSnapshot,
} from '@prisma/client';
import { BatteryEvidenceService } from './battery-evidence.service';
import { BatteryHealthService } from './battery-health.service';
import { HvBatteryHealthService } from './hv-battery-health.service';
import { TripMetricsService } from '../../observability/trip-metrics.service';
import type { HvBatterySignalObservedAt } from '../../dimo/mappers/dimo-battery-signal.mapper';

export interface MemoryVehicleLatestState {
  vehicleId: string;
  providerFetchedAt: Date | null;
  sourceTimestamp: Date | null;
  lastSeenAt: Date | null;
  lvBatteryVoltage: number | null;
  evSoc: number | null;
  tractionBatterySohPercent: number | null;
}

export interface MemoryLvSnapshot {
  id: string;
  vehicleId: string;
  voltageV: number;
  recordedAt: Date;
}

export interface MemoryEvidenceRow {
  id: string;
  vehicleId: string;
  scope: BatteryEvidenceScope;
  sourceType: BatteryEvidenceSourceType;
  valueType: BatteryEvidenceValueType;
  numericValue: number;
  observedAt: Date;
  provider: string | null;
}

function evidenceDedupKey(row: {
  vehicleId: string;
  scope: BatteryEvidenceScope;
  valueType: BatteryEvidenceValueType;
  sourceType: BatteryEvidenceSourceType;
  observedAt: Date;
}): string {
  return [
    row.vehicleId,
    row.scope,
    row.valueType,
    row.sourceType,
    row.observedAt.toISOString(),
  ].join('|');
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

export class BatteryObservationIntegrationHarness {
  readonly organizationId = 'org-integration';
  readonly vehicleId = 'veh-integration-ev';
  readonly lvVehicleId = 'veh-integration-ice';

  readonly hvSnapshots: HvBatteryHealthSnapshot[] = [];
  readonly lvSnapshots: MemoryLvSnapshot[] = [];
  readonly evidence: MemoryEvidenceRow[] = [];
  readonly vls = new Map<string, MemoryVehicleLatestState>();
  readonly discardCounts = new Map<string, number>();

  readonly tripMetrics = {
    hvSnapshotDuplicatesDiscarded: {
      inc: jest.fn(({ reason }: { reason: string }) => {
        this.discardCounts.set(reason, (this.discardCounts.get(reason) ?? 0) + 1);
      }),
    },
    batteryProviderDuplicateTotal: {
      inc: jest.fn(),
    },
  } as unknown as TripMetricsService;

  reset(): void {
    this.hvSnapshots.length = 0;
    this.lvSnapshots.length = 0;
    this.evidence.length = 0;
    this.vls.clear();
    this.discardCounts.clear();
    jest.clearAllMocks();
    idSeq = 0;
  }

  upsertVls(input: {
    vehicleId?: string;
    providerFetchedAt: Date;
    sourceTimestamp: Date | null;
    lastSeenAt?: Date | null;
    lvBatteryVoltage?: number | null;
    evSoc?: number | null;
    tractionBatterySohPercent?: number | null;
  }): MemoryVehicleLatestState {
    const vehicleId = input.vehicleId ?? this.vehicleId;
    const row: MemoryVehicleLatestState = {
      vehicleId,
      providerFetchedAt: input.providerFetchedAt,
      sourceTimestamp: input.sourceTimestamp,
      lastSeenAt: input.lastSeenAt ?? input.sourceTimestamp,
      lvBatteryVoltage: input.lvBatteryVoltage ?? null,
      evSoc: input.evSoc ?? null,
      tractionBatterySohPercent: input.tractionBatterySohPercent ?? null,
    };
    this.vls.set(vehicleId, row);
    return row;
  }

  private buildPrisma(): any {
    const self = this;
    return {
      vehicle: {
        findUnique: jest.fn(async ({ where }: any) => {
          const id = where.id as string;
          if (id === self.vehicleId || id === self.lvVehicleId) {
            return { id, organizationId: self.organizationId, fuelType: id.includes('ev') ? 'ELECTRIC' : 'GASOLINE' };
          }
          return null;
        }),
      },
      hvBatteryHealthSnapshot: {
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
          const rows = self.hvSnapshots
            .filter((s) => s.vehicleId === where.vehicleId)
            .sort((a, b) => {
              if (orderBy?.recordedAt === 'desc') {
                return b.recordedAt.getTime() - a.recordedAt.getTime();
              }
              return 0;
            });
          return rows[0] ?? null;
        }),
        findUnique: jest.fn(async ({ where }: any) => {
          const key = where.vehicleId_idempotencyKey;
          if (!key) return null;
          return (
            self.hvSnapshots.find(
              (s) =>
                s.vehicleId === key.vehicleId &&
                s.idempotencyKey === key.idempotencyKey,
            ) ?? null
          );
        }),
        create: jest.fn(async ({ data }: any) => {
          const duplicate = self.hvSnapshots.find(
            (s) =>
              s.vehicleId === data.vehicleId &&
              s.idempotencyKey === data.idempotencyKey,
          );
          if (duplicate) {
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint', {
              code: 'P2002',
              clientVersion: '5.22.0',
            });
          }
          const row = {
            id: nextId('hv-snap'),
            ...data,
          } as HvBatteryHealthSnapshot;
          self.hvSnapshots.push(row);
          return row;
        }),
        findMany: jest.fn(async () => [...self.hvSnapshots]),
      },
      batteryHealthSnapshot: {
        create: jest.fn(async ({ data }: any) => {
          const row: MemoryLvSnapshot = {
            id: nextId('lv-snap'),
            vehicleId: data.vehicle?.connect?.id ?? data.vehicleId,
            voltageV: data.voltageV,
            recordedAt: data.recordedAt ?? new Date(),
          };
          self.lvSnapshots.push(row);
          return row;
        }),
        findFirst: jest.fn(async ({ where }: any) => {
          const rows = self.lvSnapshots.filter((s) => s.vehicleId === where.vehicleId);
          return rows[rows.length - 1] ?? null;
        }),
      },
      batteryEvidence: {
        createMany: jest.fn(async ({ data, skipDuplicates }: any) => {
          let inserted = 0;
          for (const row of data as any[]) {
            const observedAt =
              row.observedAt instanceof Date ? row.observedAt : new Date(row.observedAt);
            const key = evidenceDedupKey({ ...row, observedAt });
            const exists = self.evidence.some(
              (e) => evidenceDedupKey(e) === key,
            );
            if (exists && skipDuplicates) continue;
            if (!exists) {
              self.evidence.push({
                id: nextId('ev'),
                vehicleId: row.vehicleId,
                scope: row.scope,
                sourceType: row.sourceType,
                valueType: row.valueType,
                numericValue: row.numericValue,
                observedAt,
                provider: row.provider ?? null,
              });
              inserted += 1;
            }
          }
          return { count: inserted };
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const row of self.evidence) {
            const match =
              row.vehicleId === where.vehicleId &&
              row.scope === where.scope &&
              row.valueType === where.valueType &&
              row.sourceType === where.sourceType &&
              row.observedAt.getTime() === where.observedAt.getTime();
            if (match) {
              Object.assign(row, data);
              count += 1;
            }
          }
          return { count };
        }),
        findFirst: jest.fn(async ({ where, orderBy }: any) => {
          const rows = self.evidence.filter((e) => {
            if (where.vehicleId && e.vehicleId !== where.vehicleId) return false;
            if (where.scope && e.scope !== where.scope) return false;
            if (where.valueType && e.valueType !== where.valueType) return false;
            if (where.sourceType && e.sourceType !== where.sourceType) return false;
            return true;
          });
          if (orderBy?.observedAt === 'desc') {
            rows.sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime());
          }
          return rows[0] ?? null;
        }),
      },
      vehicleLatestState: {
        findUnique: jest.fn(async ({ where }: any) => self.vls.get(where.vehicleId) ?? null),
      },
      hvBatteryHealthCurrent: { findUnique: jest.fn().mockResolvedValue(null) },
    };
  }

  buildServices() {
    const prisma = this.buildPrisma();
    const batteryEvidence = new BatteryEvidenceService(prisma);
    const batteryHealth = new BatteryHealthService(prisma, batteryEvidence);
    const hvBatteryHealth = new HvBatteryHealthService(
      prisma,
      batteryEvidence,
      this.tripMetrics,
    );
    return { prisma, batteryEvidence, batteryHealth, hvBatteryHealth };
  }

  countHvSnapshots(): number {
    return this.hvSnapshots.length;
  }

  countLvSnapshots(): number {
    return this.lvSnapshots.length;
  }

  countEvidence(scope?: BatteryEvidenceScope): number {
    if (!scope) return this.evidence.length;
    return this.evidence.filter((e) => e.scope === scope).length;
  }

  discardTotal(): number {
    return [...this.discardCounts.values()].reduce((a, b) => a + b, 0);
  }

  async pollHv(input: {
    socPercent: number;
    currentEnergyKwh?: number;
    isCharging?: boolean;
    cableConnected?: boolean;
    providerReportedSohPercent?: number;
    receivedAt: Date;
    signalObservedAt: HvBatterySignalObservedAt;
    vehicleId?: string;
    /** Simulate another worker winning the idempotent insert race (P2002). */
    simulateConcurrentInsertWin?: boolean;
  }) {
    const { hvBatteryHealth, prisma } = this.buildServices();
    if (input.simulateConcurrentInsertWin) {
      const existing = {
        id: 'hv-snap-race-winner',
        vehicleId: input.vehicleId ?? this.vehicleId,
        socPercent: input.socPercent,
        idempotencyKey: 'hv-snap:race',
        recordedAt: input.signalObservedAt.soc ?? input.receivedAt,
        providerReceivedAt: input.receivedAt,
        energyUsedKwh: input.currentEnergyKwh ?? null,
        energyObservedAt: input.signalObservedAt.currentEnergyKwh ?? null,
        isCharging: input.isCharging ?? false,
        chargingCableConnected: input.cableConnected ?? null,
        providerSohPercent: input.providerReportedSohPercent ?? null,
      };
      prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue(null);
      prisma.hvBatteryHealthSnapshot.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );
      prisma.hvBatteryHealthSnapshot.findUnique.mockResolvedValue(existing);
    }

    return hvBatteryHealth.recordSnapshot({
      vehicleId: input.vehicleId ?? this.vehicleId,
      socPercent: input.socPercent,
      currentEnergyKwh: input.currentEnergyKwh,
      isCharging: input.isCharging,
      cableConnected: input.cableConnected,
      providerReportedSohPercent: input.providerReportedSohPercent,
      receivedAt: input.receivedAt,
      signalObservedAt: input.signalObservedAt,
      providerSource: 'DIMO',
    });
  }

  async pollLv(input: {
    voltageV: number;
    observedAt: Date;
    vehicleId?: string;
  }) {
    const { batteryHealth } = this.buildServices();
    return batteryHealth.recordSnapshot({
      vehicleId: input.vehicleId ?? this.lvVehicleId,
      voltageV: input.voltageV,
      restingVoltage: input.voltageV,
      engineRunning: false,
      observedAt: input.observedAt,
    });
  }
}
