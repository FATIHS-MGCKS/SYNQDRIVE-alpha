import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import physicalRefuelReconciliationConfig from '@config/physical-refuel-reconciliation.config';
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
import {
  extractPriorFinalizationIds,
  mapDecisionToPersistPayload,
} from './physical-refuel-reconciliation.repository';
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
}

@Injectable()
export class PhysicalRefuelReconciliationRuntimeService {
  private readonly logger = new Logger(PhysicalRefuelReconciliationRuntimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(physicalRefuelReconciliationConfig.KEY)
    private readonly config: ConfigType<typeof physicalRefuelReconciliationConfig>,
    @Optional()
    private readonly fuelStationEnrichmentProducer?: FuelStationEnrichmentProducerService,
    @Optional()
    private readonly coordinateRuntime?: PhysicalRefuelCoordinateRuntimeService,
  ) {}

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async reconcileAndEnqueueAfterPersist(
    params: ReconcileAfterPersistParams,
  ): Promise<ReconcileAfterPersistResult> {
    const started = Date.now();
    const empty: ReconcileAfterPersistResult = {
      decisions: [],
      enqueuedEventIds: [],
      dedupedEventIds: [],
    };

    if (!this.isEnabled()) {
      return empty;
    }

    this.logger.log(
      JSON.stringify({
        event: 'physical_refuel_reconciliation_started',
        vehicleId: params.vehicleId,
        triggerEventId: params.triggerEventId,
      }),
    );

    let txResult: {
      decisions: PhysicalRefuelReconciliationDecision[];
      candidates: VehicleEnergyEvent[];
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
          }),
        );

        const trigger = await tx.vehicleEnergyEvent.findUnique({
          where: { id: params.triggerEventId },
        });
        if (!trigger || trigger.kind !== EnergyEventKind.REFUEL) {
          return { decisions: [], candidates: [], enqueuePlans: [] };
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
          }),
        );

        const finalizedHistory = await tx.vehicleEnergyEventRefuelReconciliation.findMany({
          where: {
            vehicleId: params.vehicleId,
            finalityState: {
              in: [
                PhysicalRefuelFinalityState.FINAL_DISTINCT,
                PhysicalRefuelFinalityState.FINAL_CANONICAL,
              ],
            },
            enrichmentEligible: true,
          },
        });

        const { priorDistinctFinalizationIds, priorCanonicalFinalizationIds } =
          extractPriorFinalizationIds(finalizedHistory);

        const firstObservedAtById = buildFirstObservedAtById(candidates);
        const decisions = reconcilePhysicalRefuelBatch(
          candidates.map(vehicleEnergyEventToRefuelRow),
          {
            asOfMs: Date.now(),
            firstObservedAtById,
            priorDistinctFinalizationIds,
            priorCanonicalFinalizationIds,
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
            memberIds: decision.siblingEventIds.length > 0
              ? decision.siblingEventIds
              : [event.id],
          });

          if (existing) {
            await tx.vehicleEnergyEventRefuelReconciliation.update({
              where: { energyEventId: event.id },
              data: {
                ...payload,
                enrichmentEnqueuedAt: existing.enrichmentEnqueuedAt,
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

        return { decisions, candidates, enqueuePlans };
      });
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'physical_refuel_reconciliation_failed',
          vehicleId: params.vehicleId,
          triggerEventId: params.triggerEventId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
      return empty;
    }

    const enqueuedEventIds: string[] = [];
    const dedupedEventIds: string[] = [];

    for (const plan of txResult.enqueuePlans) {
      const enqueueResult = await this.enqueueEligibleRefuel({
        event: plan.event,
        decision: plan.decision,
        organizationId: params.organizationId,
        tokenId: params.tokenId,
      });
      if (enqueueResult === 'enqueued') enqueuedEventIds.push(plan.event.id);
      if (enqueueResult === 'deduped') dedupedEventIds.push(plan.event.id);
    }

    return {
      decisions: txResult.decisions,
      enqueuedEventIds,
      dedupedEventIds,
    };
  }

  private async enqueueEligibleRefuel(params: {
    event: VehicleEnergyEvent;
    decision: PhysicalRefuelReconciliationDecision;
    organizationId: string;
    tokenId: number;
  }): Promise<'enqueued' | 'deduped' | 'skipped'> {
    const { event, decision } = params;
    if (!this.fuelStationEnrichmentProducer) return 'skipped';

    const reconciliation = await this.prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
      where: { energyEventId: event.id },
      include: { energyEvent: { include: { fuelStationEnrichment: true } } },
    });

    if (!reconciliation) return 'skipped';
    if (reconciliation.energyEvent.fuelStationEnrichment) return 'deduped';
    if (reconciliation.enrichmentEnqueuedAt) return 'deduped';

    let coordinateLatitude: number | null = reconciliation.coordinateLatitude;
    let coordinateLongitude: number | null = reconciliation.coordinateLongitude;
    let coordinateSource: string | null = reconciliation.coordinateSource;

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

      await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: event.id },
        data: {
          coordinateLatitude: coord.latitude,
          coordinateLongitude: coord.longitude,
          coordinateSource: coord.source,
          coordinateSelectorVersion: coord.selectorVersion,
        },
      });
    }

    const jobId = await this.fuelStationEnrichmentProducer.enqueueAfterPersist({
      energyEventId: event.id,
      eventStartTime: event.startTime,
      startLatitude: coordinateLatitude ?? event.startLatitude,
      startLongitude: coordinateLongitude ?? event.startLongitude,
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
