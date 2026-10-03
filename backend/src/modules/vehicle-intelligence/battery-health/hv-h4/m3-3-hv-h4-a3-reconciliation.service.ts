import { Injectable, Logger, Optional } from '@nestjs/common';
import type { HvChargeSession, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import {
  H4EvidenceAckIdempotencyConflictRowNotFoundError,
  H4EvidenceRevisionIdempotencyConflictRowNotFoundError,
  H4EvidenceRevisionStoredFingerprintMismatchError,
} from './m3-3-hv-h4-a3-charge-session-evidence.errors.v1';
import { M3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import { M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1 } from './m3-3-hv-h4-a3.constants';
import {
  getBatteryHvH4A3ReconciliationBatchSize,
  getBatteryHvH4A3ReconciliationInspectionLimit,
  isBatteryHvH4A3ReconciliationEnabled,
} from './m3-3-hv-h4-a3-reconciliation.config';
import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';
import { recordM3_3HvH4A3ReconciliationTick } from './m3-3-hv-h4-a3-reconciliation.metrics';
import type {
  M3_3HvH4A3FleetCursorV1,
  M3_3HvH4A3ReconciliationRowOutcomeV1,
  M3_3HvH4A3ReconciliationTickOutcomeV1,
} from './m3-3-hv-h4-a3-reconciliation.types.v1';

function fleetCursorWhere(
  cursor: M3_3HvH4A3FleetCursorV1 | null,
): Prisma.HvChargeSessionWhereInput {
  if (!cursor) return {};
  return {
    OR: [
      { organizationId: { gt: cursor.organizationId } },
      {
        organizationId: cursor.organizationId,
        vehicleId: { gt: cursor.vehicleId },
      },
      {
        organizationId: cursor.organizationId,
        vehicleId: cursor.vehicleId,
        id: { gt: cursor.id },
      },
    ],
  };
}

function currentSourceRevisionFingerprint(session: HvChargeSession): string {
  const projection = buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1(
    session,
    M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  );
  return computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(projection);
}

@Injectable()
export class M3_3HvH4A3ReconciliationService {
  private readonly logger = new Logger(M3_3HvH4A3ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly writer: M3_3HvH4ChargeSessionEvidenceWriterService,
    private readonly cursorStore: M3_3HvH4A3ReconciliationCursorStore,
    @Optional() private readonly metrics?: TripMetricsService,
  ) {}

  async runBoundedReconciliationTick(): Promise<M3_3HvH4A3ReconciliationTickOutcomeV1> {
    const started = Date.now();
    const empty = (): M3_3HvH4A3ReconciliationTickOutcomeV1 => ({
      result: 'SKIPPED_FLAG_OFF',
      inspectedCount: 0,
      createdCount: 0,
      existingCount: 0,
      ackRepairCount: 0,
      sourceChangedCount: 0,
      blockedIntegrityCount: 0,
      blockedTenantCount: 0,
      errorCount: 0,
      materializedOrRepairedCount: 0,
      durationMs: Date.now() - started,
    });

    if (!isBatteryHvH4A3ReconciliationEnabled()) {
      return empty();
    }

    const cursorLoad = await this.cursorStore.load();
    if (cursorLoad.status === 'UNAVAILABLE') {
      const outcome: M3_3HvH4A3ReconciliationTickOutcomeV1 = {
        result: 'CURSOR_UNAVAILABLE',
        inspectedCount: 0,
        createdCount: 0,
        existingCount: 0,
        ackRepairCount: 0,
        sourceChangedCount: 0,
        blockedIntegrityCount: 0,
        blockedTenantCount: 0,
        errorCount: 0,
        materializedOrRepairedCount: 0,
        durationMs: Date.now() - started,
      };
      recordM3_3HvH4A3ReconciliationTick(this.metrics, outcome);
      return outcome;
    }

    let fleetCursor: M3_3HvH4A3FleetCursorV1 | null =
      cursorLoad.status === 'OK' ? cursorLoad.cursor : null;

    const inspectionLimit = getBatteryHvH4A3ReconciliationInspectionLimit();
    const batchSize = getBatteryHvH4A3ReconciliationBatchSize();

    let inspectedCount = 0;
    let createdCount = 0;
    let existingCount = 0;
    let ackRepairCount = 0;
    let sourceChangedCount = 0;
    let blockedIntegrityCount = 0;
    let blockedTenantCount = 0;
    let errorCount = 0;
    let materializedOrRepairedCount = 0;

    let remainingInspect = inspectionLimit;
    let wrappedThisTick = false;

    while (remainingInspect > 0 && materializedOrRepairedCount < batchSize) {
      const rows = await this.prisma.hvChargeSession.findMany({
        where: fleetCursorWhere(fleetCursor),
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
        },
        orderBy: [
          { organizationId: 'asc' },
          { vehicleId: 'asc' },
          { id: 'asc' },
        ],
        take: remainingInspect,
      });

      if (rows.length === 0) {
        if (fleetCursor != null && !wrappedThisTick) {
          fleetCursor = null;
          wrappedThisTick = true;
          continue;
        }
        break;
      }

      for (const row of rows) {
        if (remainingInspect <= 0 || materializedOrRepairedCount >= batchSize) break;

        inspectedCount += 1;
        remainingInspect -= 1;

        const rowOutcome = await this.reconcileLiveSessionRow(row.id);
        switch (rowOutcome) {
          case 'CREATED':
            createdCount += 1;
            materializedOrRepairedCount += 1;
            break;
          case 'ACK_REPAIRED':
            ackRepairCount += 1;
            materializedOrRepairedCount += 1;
            break;
          case 'ALREADY_DURABLE':
            existingCount += 1;
            break;
          case 'SOURCE_CHANGED_DURING_RECONCILIATION':
            sourceChangedCount += 1;
            break;
          case 'BLOCKED_INTEGRITY':
            blockedIntegrityCount += 1;
            break;
          case 'BLOCKED_TENANT_INVARIANT':
            blockedTenantCount += 1;
            break;
          case 'SOURCE_ALREADY_GONE':
          case 'ERROR':
            if (rowOutcome === 'ERROR') errorCount += 1;
            break;
          default:
            break;
        }

        fleetCursor = {
          organizationId: row.organizationId,
          vehicleId: row.vehicleId,
          id: row.id,
        };
      }
    }

    if (fleetCursor) {
      await this.cursorStore.save(fleetCursor);
    }

    const outcome: M3_3HvH4A3ReconciliationTickOutcomeV1 = {
      result: 'COMPLETED',
      inspectedCount,
      createdCount,
      existingCount,
      ackRepairCount,
      sourceChangedCount,
      blockedIntegrityCount,
      blockedTenantCount,
      errorCount,
      materializedOrRepairedCount,
      durationMs: Date.now() - started,
    };
    recordM3_3HvH4A3ReconciliationTick(this.metrics, outcome);
    if (inspectedCount > 0) {
      this.logger.log(
        `hv_h4_a3_reconciliation_tick inspected=${inspectedCount} created=${createdCount} existing=${existingCount} ack_repair=${ackRepairCount} source_changed=${sourceChangedCount} blocked_integrity=${blockedIntegrityCount} blocked_tenant=${blockedTenantCount} errors=${errorCount} durationMs=${outcome.durationMs}`,
      );
    }
    return outcome;
  }

  async reconcileLiveSessionRow(sessionId: string): Promise<M3_3HvH4A3ReconciliationRowOutcomeV1> {
    const session = await this.prisma.hvChargeSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) return 'SOURCE_ALREADY_GONE';

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: session.vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle || vehicle.organizationId !== session.organizationId) {
      return 'BLOCKED_TENANT_INVARIANT';
    }

    const ackCountBefore = await this.prisma.batteryHvChargeSessionEvidenceAck.count({
      where: {
        organizationId: session.organizationId,
        vehicleId: session.vehicleId,
        segmentFingerprint: session.segmentFingerprint,
      },
    });

    try {
      const persistOutcome = await this.writer.persistFromHvChargeSession(session);
      const after = await this.prisma.hvChargeSession.findUnique({
        where: { id: sessionId },
      });
      if (!after) return 'SOURCE_ALREADY_GONE';

      const currentFp = currentSourceRevisionFingerprint(after);
      if (currentFp !== persistOutcome.revision.sourceRevisionFingerprint) {
        return 'SOURCE_CHANGED_DURING_RECONCILIATION';
      }

      const ackCountAfter = await this.prisma.batteryHvChargeSessionEvidenceAck.count({
        where: {
          organizationId: session.organizationId,
          vehicleId: session.vehicleId,
          segmentFingerprint: session.segmentFingerprint,
        },
      });

      if (persistOutcome.persistenceOutcome === 'CREATED') {
        return 'CREATED';
      }

      if (ackCountBefore === 0 && ackCountAfter > 0) {
        return 'ACK_REPAIRED';
      }

      return 'ALREADY_DURABLE';
    } catch (err) {
      if (
        err instanceof H4EvidenceRevisionStoredFingerprintMismatchError ||
        err instanceof H4EvidenceAckIdempotencyConflictRowNotFoundError ||
        err instanceof H4EvidenceRevisionIdempotencyConflictRowNotFoundError
      ) {
        return 'BLOCKED_INTEGRITY';
      }
      this.logger.warn(
        `hv_h4_a3_reconciliation_row_error sessionId=${sessionId} class=${err instanceof Error ? err.constructor.name : 'Unknown'}`,
      );
      return 'ERROR';
    }
  }
}
