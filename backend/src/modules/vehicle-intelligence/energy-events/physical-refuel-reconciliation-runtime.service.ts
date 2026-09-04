import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import physicalRefuelReconciliationConfig from '@config/physical-refuel-reconciliation.config';
import fuelStationEnrichmentConfig from '@config/fuel-station-enrichment.config';
import { PrismaService } from '@shared/database/prisma.service';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import {
  EnergyEventKind,
  PhysicalRefuelFinalityState,
  type VehicleEnergyEvent,
} from '@prisma/client';
import {
  buildPhysicalRefuelReconciliationLockKey,
  reconcilePhysicalRefuelBatch,
  type PhysicalRefuelReconciliationDecision,
} from './physical-refuel-reconciliation.design';
import {
  buildFirstObservedAtById,
  vehicleEnergyEventToRefuelRow,
} from './physical-refuel-row.mapper';
import {
  buildRefuelCandidateWhere,
  computeRefuelCandidateWindow,
  sortRefuelCandidates,
} from './physical-refuel-candidate.loader';
import { mapDecisionToPersistPayload } from './physical-refuel-reconciliation.repository';
import { loadPriorFinalizationBridgeContext } from './physical-refuel-prior-ownership.util';
import {
  describeCoordinateHoldReason,
  isV2CoordinateEligibleForEnrichment,
} from './physical-refuel-coordinate.policy';
import {
  countPhysicalRefuelRecoveryBacklog,
  findPhysicalRefuelRecoveryWork,
} from './physical-refuel-recovery.repository';
import { FuelStationEnrichmentProducerService } from '../fuel-stations/enrichment/fuel-station-enrichment-producer.service';
import { PhysicalRefuelCoordinateRuntimeService } from './physical-refuel-coordinate-runtime.service';

export interface ReconcileAfterPersistParams {
  vehicleId: string;
  triggerEventId: string;
  organizationId: string;
  tokenId: number;
}

export interface ReconcileAfterPersistResult {
  decisions: PhysicalRefuelReconciliationDecision[];
  enqueuedEventIds: string[];
  dedupedEventIds: string[];
  heldEventIds: string[];
}

export interface PhysicalRefuelRecoveryResult {
  processedVehicles: number;
  enqueuedEventIds: string[];
  recoveredReasons: Record<string, number>;
}

@Injectable()
export class PhysicalRefuelReconciliationRuntimeService {
  private readonly logger = new Logger(PhysicalRefuelReconciliationRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(physicalRefuelReconciliationConfig.KEY)
    private readonly config: ConfigType<typeof physicalRefuelReconciliationConfig>,
    @Inject(fuelStationEnrichmentConfig.KEY)
    private readonly fuelEnrichmentConfig: ConfigType<typeof fuelStationEnrichmentConfig>,
    @Optional()
    private readonly fuelStationEnrichmentProducer?: FuelStationEnrichmentProducerService,
    @Optional()
    private readonly coordinateRuntime?: PhysicalRefuelCoordinateRuntimeService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  resolveV2OwnershipCutoverAt(): Date | null {
    return this.config.v2OwnershipCutoverAt ?? this.fuelEnrichmentConfig.cutoverAt;
  }

  async reconcileAndEnqueueAfterPersist(
    params: ReconcileAfterPersistParams,
  ): Promise<ReconcileAfterPersistResult> {
    if (!this.isEnabled()) {
      return emptyResult();
    }

    this.logger.log(
      JSON.stringify({
        event: 'physical_refuel_reconciliation_started',
        vehicleId: params.vehicleId,
        triggerEventId: params.triggerEventId,
        source: 'persist',
      }),
    );

    return this.reconcileVehicle(params);
  }

  async runRecoveryBatch(asOfMs: number = Date.now()): Promise<PhysicalRefuelRecoveryResult> {
    if (!this.isEnabled() || !this.config.recoveryEnabled) {
      return { processedVehicles: 0, enqueuedEventIds: [], recoveredReasons: {} };
    }

    const cutover = this.resolveV2OwnershipCutoverAt();
    if (!cutover) {
      this.logger.warn(
        JSON.stringify({
          event: 'physical_refuel_recovery_skipped',
          reason: 'v2_ownership_cutover_missing',
        }),
      );
      return { processedVehicles: 0, enqueuedEventIds: [], recoveredReasons: {} };
    }

    const asOf = new Date(asOfMs);
    const orphanLookbackFrom = new Date(asOfMs - this.config.recoveryOrphanLookbackMs);
    const work = await findPhysicalRefuelRecoveryWork(this.prisma, {
      batchSize: this.config.recoveryBatchSize,
      asOf,
      v2OwnershipCutoverAt: cutover,
      orphanLookbackFrom,
    });

    const recoveredReasons: Record<string, number> = {};
    const enqueuedEventIds: string[] = [];

    for (const item of work) {
      recoveredReasons[item.reason] = (recoveredReasons[item.reason] ?? 0) + 1;
      const context = await this.resolveVehicleContext(item.vehicleId);
      if (!context) continue;

      const result = await this.reconcileVehicle({
        vehicleId: item.vehicleId,
        triggerEventId: item.triggerEventId,
        organizationId: context.organizationId,
        tokenId: context.tokenId,
        asOfMs,
        source: 'recovery',
        recoveryReason: item.reason,
      });
      enqueuedEventIds.push(...result.enqueuedEventIds);
    }

    if (work.length > 0) {
      this.logger.log(
        JSON.stringify({
          event: 'physical_refuel_recovery_batch_complete',
          processedVehicles: work.length,
          recoveredReasons,
          enqueuedCount: enqueuedEventIds.length,
        }),
      );
    }

    return {
      processedVehicles: work.length,
      enqueuedEventIds,
      recoveredReasons,
    };
  }

  async emitRecoveryBacklogMetrics(asOfMs: number = Date.now()): Promise<void> {
    if (!this.isEnabled()) return;
    const cutover = this.resolveV2OwnershipCutoverAt();
    if (!cutover) return;

    const counts = await countPhysicalRefuelRecoveryBacklog(
      this.prisma,
      new Date(asOfMs),
      cutover,
      new Date(asOfMs - this.config.recoveryOrphanLookbackMs),
    );

    this.logger.log(
      JSON.stringify({
        event: 'physical_refuel_recovery_backlog',
        ...counts,
      }),
    );
  }

  private async resolveVehicleContext(
    vehicleId: string,
  ): Promise<{ organizationId: string; tokenId: number } | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        organizationId: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) return null;
    return {
      organizationId: vehicle.organizationId,
      tokenId: vehicle.dimoVehicle.tokenId,
    };
  }

  private async reconcileVehicle(
    params: ReconcileAfterPersistParams & {
      asOfMs?: number;
      source?: 'persist' | 'recovery';
      recoveryReason?: string;
    },
  ): Promise<ReconcileAfterPersistResult> {
    const started = Date.now();
    const asOfMs = params.asOfMs ?? Date.now();
    const cutover = this.resolveV2OwnershipCutoverAt();

    let txResult: {
      decisions: PhysicalRefuelReconciliationDecision[];
      enqueuePlans: Array<{ event: VehicleEnergyEvent; decision: PhysicalRefuelReconciliationDecision }>;
    };

    try {
      txResult = await this.prisma.$transaction(async (tx) => {
        const lockKey = buildPhysicalRefuelReconciliationLockKey(params.vehicleId);
        await acquirePgAdvisoryXactLock64(tx, lockKey);
        this.logger.debug(
          JSON.stringify({
            event: 'physical_refuel_lock_acquired',
            vehicleId: params.vehicleId,
            lockKey,
            source: params.source ?? 'persist',
          }),
        );

        const trigger = await tx.vehicleEnergyEvent.findUnique({
          where: { id: params.triggerEventId },
        });
        if (!trigger || trigger.kind !== EnergyEventKind.REFUEL) {
          return { decisions: [], enqueuePlans: [] };
        }

        if (cutover && trigger.createdAt.getTime() < cutover.getTime()) {
          return { decisions: [], enqueuePlans: [] };
        }

        const window = computeRefuelCandidateWindow(
          trigger.createdAt.getTime(),
          this.config.candidateLookbackMs,
          this.config.candidateLookaheadMs,
        );

        const candidates = sortRefuelCandidates(
          await tx.vehicleEnergyEvent.findMany({
            where: buildRefuelCandidateWhere(params.vehicleId, window),
          }),
        );

        this.logger.debug(
          JSON.stringify({
            event: 'physical_refuel_candidate_count',
            vehicleId: params.vehicleId,
            candidateCount: candidates.length,
            source: params.source ?? 'persist',
          }),
        );

        const currentCandidateIds = new Set(candidates.map((c) => c.id));
        const bridgeFrom = window.from;
        const bridgeTo = new Date(
          Math.max(window.to.getTime(), trigger.createdAt.getTime()),
        );

        const priorContext = await loadPriorFinalizationBridgeContext(tx, {
          vehicleId: params.vehicleId,
          bridgeFrom,
          bridgeTo,
          currentCandidateIds,
        });

        const firstObservedAtById = buildFirstObservedAtById(candidates);
        const decisions = reconcilePhysicalRefuelBatch(
          candidates.map(vehicleEnergyEventToRefuelRow),
          {
            asOfMs,
            firstObservedAtById,
            priorDistinctFinalizationIds: priorContext.priorDistinctFinalizationIds,
            priorCanonicalFinalizationIds: priorContext.priorCanonicalFinalizationIds,
            priorFinalRowsById: priorContext.priorFinalRowsById,
            settlementConfig: { settlementHorizonMs: this.config.settlementHorizonMs },
          },
        );

        const decisionByMember = new Map<string, PhysicalRefuelReconciliationDecision>();
        for (const decision of decisions) {
          if (decision.siblingEventIds.length === 0 && decision.reasonCodes.length > 0) {
            for (const event of candidates) {
              decisionByMember.set(event.id, decision);
            }
            continue;
          }
          for (const memberId of decision.siblingEventIds) {
            decisionByMember.set(memberId, decision);
          }
        }

        for (const event of candidates) {
          const decision = decisionByMember.get(event.id);
          if (!decision) continue;

          const existing = await tx.vehicleEnergyEventRefuelReconciliation.findUnique({
            where: { energyEventId: event.id },
          });

          const payload = mapDecisionToPersistPayload({
            vehicleId: params.vehicleId,
            event,
            decision,
            memberIds:
              decision.siblingEventIds.length > 0 ? decision.siblingEventIds : [event.id],
            firstObservedAtById,
            settlementHorizonMs: this.config.settlementHorizonMs,
            asOfMs,
            coordinateSelectionStatus: existing?.coordinateSelectionStatus,
          });

          if (existing) {
            await tx.vehicleEnergyEventRefuelReconciliation.update({
              where: { energyEventId: event.id },
              data: {
                ...payload,
                enrichmentEnqueuedAt: existing.enrichmentEnqueuedAt,
                coordinateLatitude: existing.coordinateLatitude,
                coordinateLongitude: existing.coordinateLongitude,
                coordinateSource: existing.coordinateSource,
                coordinateSelectorVersion: existing.coordinateSelectorVersion,
              },
            });
          } else {
            await tx.vehicleEnergyEventRefuelReconciliation.create({ data: payload });
          }

          this.logDecision(event.id, decision, candidates.length, Date.now() - started);
        }

        const enqueuePlans: Array<{
          event: VehicleEnergyEvent;
          decision: PhysicalRefuelReconciliationDecision;
        }> = [];

        for (const event of candidates) {
          const decision = decisionByMember.get(event.id);
          if (!decision) continue;
          if (decision.enrichmentEligibleId !== event.id) continue;
          if (
            decision.finalityState !== 'FINAL_CANONICAL' &&
            decision.finalityState !== 'FINAL_DISTINCT'
          ) {
            continue;
          }

          const persisted = await tx.vehicleEnergyEventRefuelReconciliation.findUnique({
            where: { energyEventId: event.id },
            include: { energyEvent: { include: { fuelStationEnrichment: true } } },
          });
          if (!persisted) continue;
          if (persisted.energyEvent.fuelStationEnrichment) continue;
          if (persisted.enrichmentEnqueuedAt) continue;

          enqueuePlans.push({ event, decision });
        }

        return { decisions, enqueuePlans };
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'physical_refuel_reconciliation_failed',
          vehicleId: params.vehicleId,
          triggerEventId: params.triggerEventId,
          source: params.source ?? 'persist',
          recoveryReason: params.recoveryReason,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return emptyResult();
    }

    const enqueuedEventIds: string[] = [];
    const dedupedEventIds: string[] = [];
    const heldEventIds: string[] = [];

    for (const plan of txResult.enqueuePlans) {
      const enqueueResult = await this.enqueueEligibleRefuel({
        event: plan.event,
        decision: plan.decision,
        organizationId: params.organizationId,
        tokenId: params.tokenId,
      });
      if (enqueueResult === 'enqueued') enqueuedEventIds.push(plan.event.id);
      if (enqueueResult === 'deduped') dedupedEventIds.push(plan.event.id);
      if (enqueueResult === 'held') heldEventIds.push(plan.event.id);
    }

    return {
      decisions: txResult.decisions,
      enqueuedEventIds,
      dedupedEventIds,
      heldEventIds,
    };
  }

  private async enqueueEligibleRefuel(params: {
    event: VehicleEnergyEvent;
    decision: PhysicalRefuelReconciliationDecision;
    organizationId: string;
    tokenId: number;
  }): Promise<'enqueued' | 'deduped' | 'skipped' | 'held'> {
    const { event, decision } = params;
    if (!this.fuelStationEnrichmentProducer) return 'skipped';

    const reconciliation = await this.prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
      where: { energyEventId: event.id },
      include: { energyEvent: { include: { fuelStationEnrichment: true } } },
    });

    if (!reconciliation) return 'skipped';
    if (
      reconciliation.finalityState !== PhysicalRefuelFinalityState.FINAL_CANONICAL &&
      reconciliation.finalityState !== PhysicalRefuelFinalityState.FINAL_DISTINCT
    ) {
      return 'skipped';
    }
    if (!reconciliation.enrichmentEligible) return 'skipped';
    if (reconciliation.energyEvent.fuelStationEnrichment) return 'deduped';
    if (reconciliation.enrichmentEnqueuedAt) return 'deduped';

    let coordinateLatitude: number | null = reconciliation.coordinateLatitude;
    let coordinateLongitude: number | null = reconciliation.coordinateLongitude;
    let coordinateSource: string | null = reconciliation.coordinateSource;
    let coordinateSelectionStatus: string | null = reconciliation.coordinateSelectionStatus;

    if (this.coordinateRuntime) {
      const coord = await this.coordinateRuntime.resolveCoordinateForEvent(
        event,
        params.tokenId,
        {
          organizationId: params.organizationId,
          vehicleId: event.vehicleId,
          tokenId: params.tokenId,
        },
      );
      coordinateLatitude = coord.latitude;
      coordinateLongitude = coord.longitude;
      coordinateSource = coord.source;
      coordinateSelectionStatus = coord.status;

      await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: event.id },
        data: {
          coordinateLatitude: coord.latitude,
          coordinateLongitude: coord.longitude,
          coordinateSource: coord.source,
          coordinateSelectorVersion: coord.selectorVersion,
          coordinateSelectionStatus: coord.status,
        },
      });
    }

    if (
      !isV2CoordinateEligibleForEnrichment({
        latitude: coordinateLatitude,
        longitude: coordinateLongitude,
        source: coordinateSource,
      })
    ) {
      this.logger.debug(
        JSON.stringify({
          event: 'physical_refuel_coordinate_hold',
          vehicleId: event.vehicleId,
          energyEventId: event.id,
          finalityState: decision.finalityState,
          coordinateSelectionStatus: describeCoordinateHoldReason(coordinateSelectionStatus),
        }),
      );
      return 'held';
    }

    const jobId = await this.fuelStationEnrichmentProducer.enqueueAfterPersist({
      energyEventId: event.id,
      eventStartTime: event.startTime,
      startLatitude: coordinateLatitude,
      startLongitude: coordinateLongitude,
      coordinateSource: coordinateSource,
      physicalRefuelReconciliationV2: true,
    });

    if (jobId) {
      await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: event.id },
        data: { enrichmentEnqueuedAt: new Date() },
      });
      this.logger.log(
        JSON.stringify({
          event: 'physical_refuel_enrichment_eligible',
          vehicleId: event.vehicleId,
          energyEventId: event.id,
          finalityState: decision.finalityState,
          canonicalEventId: decision.canonicalEventId,
          jobId,
        }),
      );
      return 'enqueued';
    }

    return 'skipped';
  }

  private logDecision(
    eventId: string,
    decision: PhysicalRefuelReconciliationDecision,
    candidateCount: number,
    durationMs: number,
  ): void {
    const payload = {
      event: 'physical_refuel_finality_state',
      eventId,
      candidateCount,
      finalityState: decision.finalityState,
      canonicalEventId: decision.canonicalEventId,
      enrichmentEligible: decision.enrichmentEligibleId != null,
      reasonCodes: decision.reasonCodes,
      durationMs,
    };

    if (decision.reasonCodes.includes('late_sibling_after_finalization')) {
      this.logger.warn(
        JSON.stringify({ ...payload, event: 'physical_refuel_late_sibling_conflict' }),
      );
      return;
    }
    if (decision.finalityState === 'INSUFFICIENT_EVIDENCE') {
      this.logger.debug(
        JSON.stringify({ ...payload, event: 'physical_refuel_insufficient_evidence' }),
      );
      return;
    }
    this.logger.debug(JSON.stringify(payload));
  }
}

function emptyResult(): ReconcileAfterPersistResult {
  return {
    decisions: [],
    enqueuedEventIds: [],
    dedupedEventIds: [],
    heldEventIds: [],
  };
}
