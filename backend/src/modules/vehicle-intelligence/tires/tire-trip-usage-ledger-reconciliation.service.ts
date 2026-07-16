import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TireEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  rebuildSetupUsageAggregatesFromLedger,
  sumActiveLedgerRows,
  type SetupUsageAggregateTotals,
} from './tire-trip-usage-replay';

export interface SetupAggregateSnapshot {
  totalKmOnSet: number;
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
  harshAccelEvents: number;
  harshBrakeEvents: number;
  harshCornerEvents: number;
}

export interface SetupReconciliationDiff {
  setupId: string;
  vehicleId: string;
  organizationId: string | null;
  current: SetupAggregateSnapshot;
  expectedFromLedger: SetupUsageAggregateTotals;
  delta: SetupAggregateSnapshot;
  hasDiff: boolean;
  activeLedgerRows: number;
}

export interface ReconciliationAuditEntry {
  at: string;
  setupId: string;
  vehicleId: string;
  action: 'DRY_RUN' | 'REPAIR' | 'NO_OP';
  operator: string;
  reason: string;
  before: SetupAggregateSnapshot;
  after: SetupAggregateSnapshot;
  details?: Record<string, unknown>;
}

export interface ReconcileSetupAggregatesResult {
  dryRun: boolean;
  diffs: SetupReconciliationDiff[];
  repaired: number;
  unchanged: number;
  auditLog: ReconciliationAuditEntry[];
  errors: string[];
}

const TOLERANCE_KM = 0.001;
const TOLERANCE_COUNT = 0;

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function snapshotFromSetup(setup: {
  totalKmOnSet: number;
  cityKm: number;
  ruralKm: number;
  highwayKm: number;
  harshAccelEvents: number;
  harshBrakeEvents: number;
  harshCornerEvents: number;
}): SetupAggregateSnapshot {
  return {
    totalKmOnSet: round3(setup.totalKmOnSet),
    cityKm: round3(setup.cityKm),
    ruralKm: round3(setup.ruralKm),
    highwayKm: round3(setup.highwayKm),
    harshAccelEvents: setup.harshAccelEvents,
    harshBrakeEvents: setup.harshBrakeEvents,
    harshCornerEvents: setup.harshCornerEvents,
  };
}

function computeDelta(
  current: SetupAggregateSnapshot,
  expected: SetupUsageAggregateTotals,
): SetupAggregateSnapshot {
  return {
    totalKmOnSet: round3(expected.distanceKm - current.totalKmOnSet),
    cityKm: round3(expected.cityKm - current.cityKm),
    ruralKm: round3(expected.ruralKm - current.ruralKm),
    highwayKm: round3(expected.highwayKm - current.highwayKm),
    harshAccelEvents: expected.harshAccelerationCount - current.harshAccelEvents,
    harshBrakeEvents: expected.harshBrakingCount - current.harshBrakeEvents,
    harshCornerEvents: expected.harshCorneringCount - current.harshCornerEvents,
  };
}

function hasMaterialDiff(delta: SetupAggregateSnapshot): boolean {
  return (
    Math.abs(delta.totalKmOnSet) > TOLERANCE_KM ||
    Math.abs(delta.cityKm) > TOLERANCE_KM ||
    Math.abs(delta.ruralKm) > TOLERANCE_KM ||
    Math.abs(delta.highwayKm) > TOLERANCE_KM ||
    Math.abs(delta.harshAccelEvents) > TOLERANCE_COUNT ||
    Math.abs(delta.harshBrakeEvents) > TOLERANCE_COUNT ||
    Math.abs(delta.harshCornerEvents) > TOLERANCE_COUNT
  );
}

function totalsToSnapshot(totals: SetupUsageAggregateTotals): SetupAggregateSnapshot {
  return {
    totalKmOnSet: totals.distanceKm,
    cityKm: totals.cityKm,
    ruralKm: totals.ruralKm,
    highwayKm: totals.highwayKm,
    harshAccelEvents: totals.harshAccelerationCount,
    harshBrakeEvents: totals.harshBrakingCount,
    harshCornerEvents: totals.harshCorneringCount,
  };
}

@Injectable()
export class TireTripUsageLedgerReconciliationService {
  private readonly logger = new Logger(TireTripUsageLedgerReconciliationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async compareSetupAggregates(setupId: string): Promise<SetupReconciliationDiff | null> {
    const setup = await this.prisma.vehicleTireSetup.findUnique({
      where: { id: setupId },
      select: {
        id: true,
        vehicleId: true,
        organizationId: true,
        totalKmOnSet: true,
        cityKm: true,
        ruralKm: true,
        highwayKm: true,
        harshAccelEvents: true,
        harshBrakeEvents: true,
        harshCornerEvents: true,
      },
    });
    if (!setup) return null;

    const ledgerRows = await this.prisma.tireTripUsageLedger.findMany({
      where: { tireSetupId: setupId, invalidatedAt: null },
    });
    const expectedFromLedger = sumActiveLedgerRows(ledgerRows);
    const current = snapshotFromSetup(setup);
    const delta = computeDelta(current, expectedFromLedger);

    return {
      setupId: setup.id,
      vehicleId: setup.vehicleId,
      organizationId: setup.organizationId,
      current,
      expectedFromLedger,
      delta,
      hasDiff: hasMaterialDiff(delta),
      activeLedgerRows: expectedFromLedger.activeLedgerRows,
    };
  }

  async dryRunReconcileSetupAggregates(
    setupIds: string[],
    opts: { operator: string; reason: string },
  ): Promise<ReconcileSetupAggregatesResult> {
    return this.reconcileSetupAggregates(setupIds, {
      ...opts,
      apply: false,
    });
  }

  async repairSetupAggregates(
    setupIds: string[],
    opts: { operator: string; reason: string },
  ): Promise<ReconcileSetupAggregatesResult> {
    return this.reconcileSetupAggregates(setupIds, {
      ...opts,
      apply: true,
    });
  }

  private async reconcileSetupAggregates(
    setupIds: string[],
    opts: { operator: string; reason: string; apply: boolean },
  ): Promise<ReconcileSetupAggregatesResult> {
    const uniqueIds = [...new Set(setupIds)];
    const diffs: SetupReconciliationDiff[] = [];
    const auditLog: ReconciliationAuditEntry[] = [];
    const errors: string[] = [];
    let repaired = 0;
    let unchanged = 0;

    for (const setupId of uniqueIds) {
      try {
        const diff = await this.compareSetupAggregates(setupId);
        if (!diff) {
          errors.push(`setup_not_found:${setupId}`);
          continue;
        }
        diffs.push(diff);

        if (!diff.hasDiff) {
          unchanged += 1;
          auditLog.push({
            at: new Date().toISOString(),
            setupId: diff.setupId,
            vehicleId: diff.vehicleId,
            action: 'NO_OP',
            operator: opts.operator,
            reason: opts.reason,
            before: diff.current,
            after: diff.current,
            details: { activeLedgerRows: diff.activeLedgerRows },
          });
          continue;
        }

        if (!opts.apply) {
          auditLog.push({
            at: new Date().toISOString(),
            setupId: diff.setupId,
            vehicleId: diff.vehicleId,
            action: 'DRY_RUN',
            operator: opts.operator,
            reason: opts.reason,
            before: diff.current,
            after: totalsToSnapshot(diff.expectedFromLedger),
            details: { delta: diff.delta, activeLedgerRows: diff.activeLedgerRows },
          });
          continue;
        }

        const afterTotals = await this.prisma.$transaction(async (tx) => {
          const totals = await rebuildSetupUsageAggregatesFromLedger(tx, setupId);
          const organizationId =
            diff.organizationId ??
            (
              await tx.vehicle.findUnique({
                where: { id: diff.vehicleId },
                select: { organizationId: true },
              })
            )?.organizationId;
          if (organizationId) {
            await tx.tireEvent.create({
              data: {
                organizationId,
                vehicleId: diff.vehicleId,
                tireSetId: setupId,
                type: TireEventType.TRIP_USAGE_REVISED,
                payload: {
                  command: 'reconcileSetupAggregatesFromLedger',
                  operator: opts.operator,
                  reason: opts.reason,
                  before: diff.current,
                  after: totalsToSnapshot(totals),
                  delta: diff.delta,
                } as unknown as Prisma.InputJsonValue,
                createdBy: 'system:tire-trip-usage-reconcile',
              },
            });
          }
          return totals;
        });

        repaired += 1;
        auditLog.push({
          at: new Date().toISOString(),
          setupId: diff.setupId,
          vehicleId: diff.vehicleId,
          action: 'REPAIR',
          operator: opts.operator,
          reason: opts.reason,
          before: diff.current,
          after: totalsToSnapshot(afterTotals),
          details: { delta: diff.delta, activeLedgerRows: afterTotals.activeLedgerRows },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${setupId}:${message}`);
        this.logger.warn(`Reconcile failed for setup ${setupId}: ${message}`);
      }
    }

    return {
      dryRun: !opts.apply,
      diffs,
      repaired,
      unchanged,
      auditLog,
      errors,
    };
  }
}
