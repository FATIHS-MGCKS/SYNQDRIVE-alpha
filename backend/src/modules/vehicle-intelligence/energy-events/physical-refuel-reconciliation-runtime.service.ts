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
import { mapDecisionToPersistPayload, isV2OwnedRefuelEvent } from './physical-refuel-reconciliation.repository';
import { loadPriorFinalizationBridgeContext } from './physical-refuel-prior-ownership.util';
import {
  describeCoordinateHoldReason,
  isV2CoordinateEligibleForEnrichment,
} from './physical-refuel-coordinate.policy';
import {
  COORDINATE_HOLD_MISSING_DIMO_TOKEN,
  COORDINATE_ROUTE_EVIDENCE_STABILIZING,
  computeNextCoordinateRetryAt,
  isCoordinateStatusRetryable,
  isCoordinateStatusTerminal,
  isRouteEvidenceInvalidated,
  resolveRouteEvidenceCoordinateStatus,
  shouldAttemptCoordinateResolution,
} from './physical-refuel-coordinate-retry.policy';
import {
  computeCoordinateEvidenceFingerprint,
  hasCoordinateEvidenceChanged,
} from './physical-refuel-coordinate-evidence.util';
import {
  isV2StaleEnrichmentRecoverable,
  FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS,
} from '../fuel-stations/enrichment/fuel-station-enrichment-stale.util';
import { shouldIncludeRefuelInEnqueuePlan } from './physical-refuel-enqueue-plan.util';
import {
  countPhysicalRefuelRecoveryBacklog,
  findPhysicalRefuelRecoveryWork,
} from './physical-refuel-recovery.repository';
import { FuelStationEnrichmentProducerService } from '../fuel-stations/enrichment/fuel-station-enrichment-producer.service';
import { PhysicalRefuelCoordinateRuntimeService } from './physical-refuel-coordinate-runtime.service';

export interface ReconcileAfterPersistParams {
  vehicleId: string;
  triggerEventId: string;
  organizationId?: string;
  tokenId?: number | null;
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
      try {
        const organizationId = await this.resolveOrganizationId(item.vehicleId);
        const tokenId = await this.resolveVehicleTokenId(item.vehicleId);

        if (!organizationId) {
          this.logger.warn(
            JSON.stringify({
              event: 'physical_refuel_recovery_context_hold',
              vehicleId: item.vehicleId,
              triggerEventId: item.triggerEventId,
              recoveryReason: item.reason,
              reason: 'organization_missing',
            }),
          );
        }

        const result = await this.reconcileVehicle({
          vehicleId: item.vehicleId,
          triggerEventId: item.triggerEventId,
          organizationId: organizationId ?? undefined,
          tokenId: tokenId ?? null,
          asOfMs,
          source: 'recovery',
          recoveryReason: item.reason,
        });
        enqueuedEventIds.push(...result.enqueuedEventIds);
      } catch (error) {
        this.logger.error(
          JSON.stringify({
            event: 'physical_refuel_recovery_vehicle_failed',
            vehicleId: item.vehicleId,
            triggerEventId: item.triggerEventId,
            recoveryReason: item.reason,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      }
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

  private async resolveOrganizationId(vehicleId: string): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? null;
  }

  private async resolveVehicleTokenId(vehicleId: string): Promise<number | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { dimoVehicle: { select: { tokenId: true } } },
    });
    return vehicle?.dimoVehicle?.tokenId ?? null;
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
            where: buildRefuelCandidateWhere(params.vehicleId, window, cutover),
          }),
        );

        const v2Candidates = cutover
          ? candidates.filter((candidate) => isV2OwnedRefuelEvent(candidate, cutover))
          : candidates;

        this.logger.debug(
          JSON.stringify({
            event: 'physical_refuel_candidate_count',
            vehicleId: params.vehicleId,
            candidateCount: v2Candidates.length,
            legacyBridgeExcluded: candidates.length - v2Candidates.length,
            source: params.source ?? 'persist',
          }),
        );

        const currentCandidateIds = new Set(v2Candidates.map((c) => c.id));
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

        const firstObservedAtById = buildFirstObservedAtById(v2Candidates);
        const decisions = reconcilePhysicalRefuelBatch(
          v2Candidates.map(vehicleEnergyEventToRefuelRow),
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
            for (const event of v2Candidates) {
              decisionByMember.set(event.id, decision);
            }
            continue;
          }
          for (const memberId of decision.siblingEventIds) {
            decisionByMember.set(memberId, decision);
          }
        }

        for (const event of v2Candidates) {
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
                coordinateEvidenceFingerprint: existing.coordinateEvidenceFingerprint,
              },
            });
          } else {
            await tx.vehicleEnergyEventRefuelReconciliation.create({ data: payload });
          }

          this.logDecision(event.id, decision, v2Candidates.length, Date.now() - started);
        }

        const enqueuePlans: Array<{
          event: VehicleEnergyEvent;
          decision: PhysicalRefuelReconciliationDecision;
        }> = [];

        for (const event of v2Candidates) {
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
          if (
            !shouldIncludeRefuelInEnqueuePlan({
              fuelStationEnrichment: persisted.energyEvent.fuelStationEnrichment,
              enrichmentEnqueuedAt: persisted.enrichmentEnqueuedAt,
              asOfMs,
            })
          ) {
            continue;
          }

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
        tokenId: params.tokenId ?? null,
        asOfMs,
      });
      if (enqueueResult === 'enqueued') enqueuedEventIds.push(plan.event.id);
      if (enqueueResult === 'deduped') dedupedEventIds.push(plan.event.id);
      if (enqueueResult === 'held' || enqueueResult === 'deferred') heldEventIds.push(plan.event.id);
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
    organizationId?: string;
    tokenId?: number | null;
    asOfMs?: number;
  }): Promise<'enqueued' | 'deduped' | 'skipped' | 'held' | 'deferred'> {
    const { event, decision } = params;
    const asOfMs = params.asOfMs ?? Date.now();
    const v2Cutover = this.resolveV2OwnershipCutoverAt();
    if (!this.fuelStationEnrichmentProducer) return 'skipped';

    const reconciliation = await this.prisma.vehicleEnergyEventRefuelReconciliation.findUnique({
      where: { energyEventId: event.id },
      include: {
        energyEvent: {
          include: {
            fuelStationEnrichment: true,
          },
        },
      },
    });

    if (!reconciliation) return 'skipped';
    if (
      reconciliation.finalityState !== PhysicalRefuelFinalityState.FINAL_CANONICAL &&
      reconciliation.finalityState !== PhysicalRefuelFinalityState.FINAL_DISTINCT
    ) {
      return 'skipped';
    }
    if (!reconciliation.enrichmentEligible) return 'skipped';

    const enrichment = reconciliation.energyEvent.fuelStationEnrichment;
    const isStaleEnrichment = isV2StaleEnrichmentRecoverable(enrichment, asOfMs);

    if (enrichment && !isStaleEnrichment) return 'deduped';
    if (reconciliation.enrichmentEnqueuedAt && !isStaleEnrichment) return 'deduped';

    if (
      isStaleEnrichment &&
      enrichment?.processingStatus === 'PROCESSING' &&
      enrichment.lastAttemptAt != null &&
      enrichment.lastAttemptAt.getTime() <
        asOfMs - FUEL_STATION_ENRICHMENT_STALE_PROCESSING_MS
    ) {
      await this.prisma.vehicleEnergyEventFuelStationEnrichment.update({
        where: { energyEventId: event.id },
        data: { processingStatus: 'PENDING' },
      });
    }

    const evidenceFingerprint = computeCoordinateEvidenceFingerprint(event);
    const evidenceInvalidated = hasCoordinateEvidenceChanged(
      reconciliation.coordinateEvidenceFingerprint,
      evidenceFingerprint,
    );

    let coordinateLatitude: number | null = reconciliation.coordinateLatitude;
    let coordinateLongitude: number | null = reconciliation.coordinateLongitude;
    let coordinateSource: string | null = reconciliation.coordinateSource;
    let coordinateSelectionStatus: string | null = evidenceInvalidated
      ? null
      : reconciliation.coordinateSelectionStatus;
    let coordinateRetryCount = evidenceInvalidated ? 0 : reconciliation.coordinateRetryCount ?? 0;
    let nextCoordinateRetryAt = evidenceInvalidated ? null : reconciliation.nextCoordinateRetryAt;
    let routeEvidenceFingerprint: string | null = reconciliation.routeEvidenceFingerprint;
    let routeEvidenceStabilizationUntil: Date | null =
      reconciliation.routeEvidenceStabilizationUntil;

    if (evidenceInvalidated) {
      await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: event.id },
        data: {
          coordinateSelectionStatus: null,
          coordinateLatitude: null,
          coordinateLongitude: null,
          coordinateSource: null,
          coordinateSelectorVersion: null,
          coordinateRetryCount: 0,
          nextCoordinateRetryAt: null,
          coordinateEvidenceFingerprint: evidenceFingerprint,
          routeEvidenceFingerprint: null,
          routeEvidenceStabilizationUntil: null,
        },
      });
      routeEvidenceFingerprint = null;
      routeEvidenceStabilizationUntil = null;
    }

    const needsCoordinateAttempt = shouldAttemptCoordinateResolution({
      coordinateLatitude,
      coordinateLongitude,
      coordinateSource,
      coordinateSelectionStatus,
      nextCoordinateRetryAt,
      asOfMs,
      evidenceInvalidated,
    });

    if (needsCoordinateAttempt) {
      if (!params.tokenId || !params.organizationId) {
        coordinateSelectionStatus = COORDINATE_HOLD_MISSING_DIMO_TOKEN;
        await this.persistCoordinateHold({
          energyEventId: event.id,
          status: coordinateSelectionStatus,
          retryCount: coordinateRetryCount,
          asOfMs,
          evidenceFingerprint,
          routeEvidenceFingerprint,
          routeEvidenceStabilizationUntil,
        });
        coordinateRetryCount += 1;
        this.logger.debug(
          JSON.stringify({
            event: 'physical_refuel_coordinate_hold',
            vehicleId: event.vehicleId,
            energyEventId: event.id,
            finalityState: decision.finalityState,
            coordinateSelectionStatus,
          }),
        );
        return 'held';
      }

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

        const routeChanged = isRouteEvidenceInvalidated(
          routeEvidenceFingerprint,
          coord.routeEvidenceFingerprint,
          coordinateSelectionStatus,
        );
        if (routeChanged) {
          coordinateSelectionStatus = null;
          coordinateRetryCount = 0;
          nextCoordinateRetryAt = null;
        }

        routeEvidenceFingerprint = coord.routeEvidenceFingerprint;

        let resolvedStatus = coord.status;
        let stabilizationUntil: Date | null = routeEvidenceStabilizationUntil;
        if (
          coord.status === 'NO_DWELL_FOUND' ||
          coord.status === 'INSUFFICIENT_EVIDENCE' ||
          coord.status === 'AMBIGUOUS'
        ) {
          const stabilized = resolveRouteEvidenceCoordinateStatus({
            selectorStatus: coord.status,
            eventObservedAtMs: event.createdAt.getTime(),
            asOfMs,
            stabilizationHorizonMs: this.config.routeEvidenceStabilizationMs,
            routeEvidenceStabilizationUntil,
          });
          resolvedStatus = stabilized.status;
          stabilizationUntil = stabilized.stabilizationUntil;
        }

        coordinateSelectionStatus = resolvedStatus;
        routeEvidenceStabilizationUntil = stabilizationUntil;

        if (resolvedStatus === 'SELECTED' && coord.latitude != null && coord.longitude != null) {
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
              coordinateSelectionStatus: resolvedStatus,
              coordinateEvidenceFingerprint: evidenceFingerprint,
              routeEvidenceFingerprint,
              routeEvidenceStabilizationUntil: null,
              lastCoordinateAttemptAt: new Date(asOfMs),
              nextCoordinateRetryAt: null,
            },
          });
        } else if (isCoordinateStatusRetryable(resolvedStatus)) {
          await this.persistCoordinateHold({
            energyEventId: event.id,
            status: resolvedStatus,
            retryCount: coordinateRetryCount,
            asOfMs,
            evidenceFingerprint,
            routeEvidenceFingerprint,
            routeEvidenceStabilizationUntil: stabilizationUntil,
          });
          coordinateRetryCount += 1;
          if (resolvedStatus === COORDINATE_ROUTE_EVIDENCE_STABILIZING) {
            this.logger.debug(
              JSON.stringify({
                event: 'physical_refuel_route_evidence_stabilizing',
                vehicleId: event.vehicleId,
                energyEventId: event.id,
                stabilizationUntil: stabilizationUntil?.toISOString() ?? null,
              }),
            );
          }
          this.logger.debug(
            JSON.stringify({
              event: 'physical_refuel_coordinate_hold',
              vehicleId: event.vehicleId,
              energyEventId: event.id,
              finalityState: decision.finalityState,
              coordinateSelectionStatus: describeCoordinateHoldReason(resolvedStatus),
            }),
          );
          return 'held';
        } else if (isCoordinateStatusTerminal(resolvedStatus)) {
          await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
            where: { energyEventId: event.id },
            data: {
              coordinateSelectionStatus: resolvedStatus,
              coordinateEvidenceFingerprint: evidenceFingerprint,
              routeEvidenceFingerprint,
              routeEvidenceStabilizationUntil: null,
              lastCoordinateAttemptAt: new Date(asOfMs),
              nextCoordinateRetryAt: null,
            },
          });
          this.logger.debug(
            JSON.stringify({
              event: 'physical_refuel_coordinate_hold',
              vehicleId: event.vehicleId,
              energyEventId: event.id,
              finalityState: decision.finalityState,
              coordinateSelectionStatus: describeCoordinateHoldReason(resolvedStatus),
            }),
          );
          return 'held';
        }
      }
    }

    if (
      !isV2CoordinateEligibleForEnrichment({
        latitude: coordinateLatitude,
        longitude: coordinateLongitude,
        source: coordinateSource,
      })
    ) {
      return 'held';
    }

    if (!v2Cutover) {
      return 'skipped';
    }

    const outcome = await this.fuelStationEnrichmentProducer.enqueueAfterPersistOutcome({
      energyEventId: event.id,
      eventStartTime: event.startTime,
      eventObservedAt: event.createdAt,
      v2OwnershipCutoverAt: v2Cutover,
      startLatitude: coordinateLatitude,
      startLongitude: coordinateLongitude,
      coordinateSource: coordinateSource,
      physicalRefuelReconciliationV2: true,
    });

    if (outcome.status === 'deferred_queue_unavailable') {
      this.logger.debug(
        JSON.stringify({
          event: 'physical_refuel_enqueue_deferred',
          vehicleId: event.vehicleId,
          energyEventId: event.id,
        }),
      );
      return 'deferred';
    }

    if (outcome.status === 'deduped' || outcome.status === 'enqueued') {
      await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
        where: { energyEventId: event.id },
        data: {
          enrichmentEnqueuedAt: new Date(asOfMs),
          nextCoordinateRetryAt: null,
          coordinateEvidenceFingerprint: evidenceFingerprint,
        },
      });
      if (outcome.status === 'enqueued') {
        this.logger.log(
          JSON.stringify({
            event: 'physical_refuel_enrichment_eligible',
            vehicleId: event.vehicleId,
            energyEventId: event.id,
            finalityState: decision.finalityState,
            canonicalEventId: decision.canonicalEventId,
            jobId: outcome.jobId,
          }),
        );
        return 'enqueued';
      }
      return 'deduped';
    }

    return 'skipped';
  }

  private async persistCoordinateHold(params: {
    energyEventId: string;
    status: string | null;
    retryCount: number;
    asOfMs: number;
    evidenceFingerprint: string;
    routeEvidenceFingerprint?: string | null;
    routeEvidenceStabilizationUntil?: Date | null;
  }): Promise<void> {
    const terminal = isCoordinateStatusTerminal(params.status);
    const retryable = isCoordinateStatusRetryable(params.status);
    const nextRetryCount = retryable && !terminal ? params.retryCount + 1 : params.retryCount;
    await this.prisma.vehicleEnergyEventRefuelReconciliation.update({
      where: { energyEventId: params.energyEventId },
      data: {
        coordinateSelectionStatus: params.status,
        coordinateRetryCount: nextRetryCount,
        coordinateEvidenceFingerprint: params.evidenceFingerprint,
        routeEvidenceFingerprint: params.routeEvidenceFingerprint ?? null,
        routeEvidenceStabilizationUntil: params.routeEvidenceStabilizationUntil ?? null,
        lastCoordinateAttemptAt: new Date(params.asOfMs),
        nextCoordinateRetryAt:
          retryable && !terminal
            ? computeNextCoordinateRetryAt(nextRetryCount, params.asOfMs)
            : null,
      },
    });
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
