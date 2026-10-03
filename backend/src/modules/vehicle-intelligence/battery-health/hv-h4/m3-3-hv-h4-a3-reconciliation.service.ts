import { Injectable, Logger, Optional } from '@nestjs/common';
import type { BatteryHvChargeSessionEvidenceAck, HvChargeSession, Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import { buildM3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import type { M3_3HvH4ChargeSessionEvidencePersistOutcomeV1 } from './m3-3-hv-h4-a3-charge-session-evidence.persistence.types.v1';
import { M3_3HvH4ChargeSessionEvidenceWriterService } from './m3-3-hv-h4-a3-charge-session-evidence-writer.service';
import {
  M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
  M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
} from './m3-3-hv-h4-a3.constants';
import {
  getBatteryHvH4A3ReconciliationBatchSize,
  getBatteryHvH4A3ReconciliationInspectionLimit,
  isBatteryHvH4A3ReconciliationEnabled,
} from './m3-3-hv-h4-a3-reconciliation.config';
import { M3_3HvH4A3ReconciliationCursorStore } from './m3-3-hv-h4-a3-reconciliation-cursor.store';
import { isH4EvidenceIntegrityFailureV1 } from './m3-3-hv-h4-a3-reconciliation.integrity.v1';
import { recordM3_3HvH4A3ReconciliationTick } from './m3-3-hv-h4-a3-reconciliation.metrics';
import type {
  M3_3HvH4A3FleetCursorV1,
  M3_3HvH4A3ReconciliationPersistenceEffectV1,
  M3_3HvH4A3ReconciliationRowResultV1,
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

function derivePersistenceEffectFromWriterOutcomeV1(
  persistOutcome: M3_3HvH4ChargeSessionEvidencePersistOutcomeV1,
  exactCurrentAckBefore: BatteryHvChargeSessionEvidenceAck | null,
): M3_3HvH4A3ReconciliationPersistenceEffectV1 {
  if (persistOutcome.persistenceOutcome === 'CREATED') {
    return 'REVISION_CREATED';
  }
  if (!exactCurrentAckBefore) {
    return 'ACK_REPAIRED';
  }
  return 'NONE';
}

function persistenceEffectConsumesMutationBudget(
  effect: M3_3HvH4A3ReconciliationPersistenceEffectV1,
): boolean {
  return effect === 'REVISION_CREATED' || effect === 'ACK_REPAIRED';
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

        const rowResult = await this.reconcileLiveSessionRow(row.id);
        if (persistenceEffectConsumesMutationBudget(rowResult.persistenceEffect)) {
          materializedOrRepairedCount += 1;
        }

        switch (rowResult.classification) {
          case 'CREATED':
            createdCount += 1;
            break;
          case 'ACK_REPAIRED':
            ackRepairCount += 1;
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
          case 'ERROR':
            errorCount += 1;
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

    let tickResult: M3_3HvH4A3ReconciliationTickOutcomeV1['result'] = 'COMPLETED';
    if (fleetCursor) {
      const saved = await this.cursorStore.save(fleetCursor);
      if (!saved) {
        tickResult = 'CURSOR_SAVE_FAILED';
      }
    }

    const outcome: M3_3HvH4A3ReconciliationTickOutcomeV1 = {
      result: tickResult,
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
        `hv_h4_a3_reconciliation_tick result=${tickResult} inspected=${inspectedCount} created=${createdCount} existing=${existingCount} ack_repair=${ackRepairCount} source_changed=${sourceChangedCount} blocked_integrity=${blockedIntegrityCount} blocked_tenant=${blockedTenantCount} errors=${errorCount} mutating_writes=${materializedOrRepairedCount} durationMs=${outcome.durationMs}`,
      );
    }
    return outcome;
  }

  async reconcileLiveSessionRow(sessionId: string): Promise<M3_3HvH4A3ReconciliationRowResultV1> {
    const none: M3_3HvH4A3ReconciliationPersistenceEffectV1 = 'NONE';

    const session = await this.prisma.hvChargeSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      return { classification: 'SOURCE_ALREADY_GONE', persistenceEffect: none };
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: session.vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle || vehicle.organizationId !== session.organizationId) {
      return { classification: 'BLOCKED_TENANT_INVARIANT', persistenceEffect: none };
    }

    const currentFp = currentSourceRevisionFingerprint(session);
    const exactCurrentAckBefore =
      await this.prisma.batteryHvChargeSessionEvidenceAck.findFirst({
        where: {
          organizationId: session.organizationId,
          vehicleId: session.vehicleId,
          segmentFingerprint: session.segmentFingerprint,
          evidenceContractVersion: M3_3_HV_H4_CHARGE_SESSION_EVIDENCE_REVISION_V1,
          sourceRevisionFingerprint: currentFp,
          durabilityAckContractVersion: M3_3_HV_H4_DURABLE_SOURCE_REVISION_ACK_V1,
        },
      });

    try {
      const persistOutcome = await this.writer.persistFromHvChargeSession(session);
      const persistenceEffect = derivePersistenceEffectFromWriterOutcomeV1(
        persistOutcome,
        exactCurrentAckBefore,
      );

      const after = await this.prisma.hvChargeSession.findUnique({
        where: { id: sessionId },
      });
      if (!after) {
        return { classification: 'SOURCE_ALREADY_GONE', persistenceEffect };
      }

      const afterFp = currentSourceRevisionFingerprint(after);
      if (afterFp !== persistOutcome.revision.sourceRevisionFingerprint) {
        return {
          classification: 'SOURCE_CHANGED_DURING_RECONCILIATION',
          persistenceEffect,
        };
      }

      if (persistOutcome.persistenceOutcome === 'CREATED') {
        return { classification: 'CREATED', persistenceEffect };
      }

      if (persistenceEffect === 'ACK_REPAIRED') {
        return { classification: 'ACK_REPAIRED', persistenceEffect };
      }

      return { classification: 'ALREADY_DURABLE', persistenceEffect: none };
    } catch (err) {
      if (isH4EvidenceIntegrityFailureV1(err)) {
        return { classification: 'BLOCKED_INTEGRITY', persistenceEffect: none };
      }
      this.logger.warn(
        `hv_h4_a3_reconciliation_row_error sessionId=${sessionId} class=${err instanceof Error ? err.constructor.name : 'Unknown'}`,
      );
      return { classification: 'ERROR', persistenceEffect: none };
    }
  }
}
