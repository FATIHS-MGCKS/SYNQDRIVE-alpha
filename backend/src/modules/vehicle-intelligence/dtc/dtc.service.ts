import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DtcSeverity, Prisma, VehicleDtcEvent } from '@prisma/client';
import {
  BrakeDtcEvidenceProducerService,
  type BrakeDtcProducerContext,
} from '../brakes/brake-dtc-evidence.producer';
import { RentalHealthSummaryCacheService } from '@modules/rental-health/rental-health-summary-cache.service';
import { FindingBridgeService } from '../findings/finding-bridge.service';

// ── Constants ──────────────────────────────────────────────────────────────────

/** Data is considered stale if no successful check in 6 hours (= 2× poll interval). */
const DTC_STALE_THRESHOLD_MS = 6 * 60 * 60_000;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getDtcCategory(code: string): string {
  switch (code?.charAt(0)?.toUpperCase()) {
    case 'P':
      return 'Powertrain';
    case 'B':
      return 'Body';
    case 'C':
      return 'Chassis';
    case 'U':
      return 'Network';
    default:
      return 'Unknown';
  }
}

import {
  getSeverityDisplay,
  maxDtcSeverityBand,
  normalizeDtcSeverityBand,
  type DtcSeverityBand,
} from './dtc-severity.util';
import { isDtc01aSafetyFoundationEnabled } from './snapshot/dtc-01a.config';
import type { DtcFaultConfirmation } from './snapshot/dtc-snapshot.types';

function isDataStale(lastSuccessfulCheckAt: Date | null | undefined): boolean {
  if (!lastSuccessfulCheckAt) return true;
  return (
    Date.now() - new Date(lastSuccessfulCheckAt).getTime() >
    DTC_STALE_THRESHOLD_MS
  );
}

function resolveFaultConfirmation(isStale: boolean): DtcFaultConfirmation {
  return isStale ? 'last_known_unconfirmed' : 'confirmed';
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class DtcService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly brakeDtcProducer?: BrakeDtcEvidenceProducerService,
    @Optional() private readonly rentalHealthSummaryCache?: RentalHealthSummaryCacheService,
    @Optional() private readonly findingBridge?: FindingBridgeService,
  ) {}

  // ── Basic reads ─────────────────────────────────────────────────────────────

  /**
   * Returns the most recent DTC events for a vehicle (active + historical).
   * Hard cap prevents unbounded queries for high-fault vehicles accumulating
   * history over time. UI only needs the recent tail.
   */
  async findByVehicle(vehicleId: string, limit: number = 200) {
    const safeLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
    return this.prisma.vehicleDtcEvent.findMany({
      where: { vehicleId },
      orderBy: { lastSeenAt: 'desc' },
      take: safeLimit,
    });
  }

  async findActive(vehicleId: string) {
    return this.prisma.vehicleDtcEvent.findMany({
      where: { vehicleId, isActive: true },
      orderBy: { lastSeenAt: 'desc' },
      // Practical cap: active faults for a single vehicle very rarely exceed
      // a few dozen; this protects against pathological data.
      take: 200,
    });
  }

  async getStats(vehicleId: string) {
    const [active, total, latestState] = await Promise.all([
      this.prisma.vehicleDtcEvent.count({ where: { vehicleId, isActive: true } }),
      this.prisma.vehicleDtcEvent.count({ where: { vehicleId } }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastDtcPollAt: true,
          lastDtcSuccessfulCheckAt: true,
          dtcPollStatus: true,
        },
      }),
    ]);
    return {
      active,
      total,
      lastChecked: latestState?.lastDtcPollAt ?? null,
      lastSuccessfulCheck: latestState?.lastDtcSuccessfulCheckAt ?? null,
      pollStatus: latestState?.dtcPollStatus ?? null,
    };
  }

  // ── Summary — UI-ready, freshness-aware ─────────────────────────────────────

  /**
   * Returns a UI-ready DTC summary for the Quick View box.
   *
   * Status values:
   *   • 'unavailable'   — no DTC poll has ever been attempted
   *   • 'stale'         — last successful check is older than the stale threshold
   *   • 'clean'         — fresh check, no active faults
   *   • 'active_faults' — fresh check, faults present
   *
   * IMPORTANT: 'clean' is NEVER returned when data is stale.
   */
  async getSummary(vehicleId: string) {
    const dtc01a = isDtc01aSafetyFoundationEnabled();
    const [latestState, previewFaults] = await Promise.all([
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastDtcPollAt: true,
          lastDtcSuccessfulCheckAt: true,
          dtcPollStatus: true,
          sourceTimestamp: true,
        },
      }),
      this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId, isActive: true },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
        take: 3,
      }),
    ]);

    const lastCheckedAt = latestState?.lastDtcPollAt ?? null;
    const lastSuccessfulCheckAt = latestState?.lastDtcSuccessfulCheckAt ?? null;
    const stale = isDataStale(lastSuccessfulCheckAt);
    const hasNeverBeenChecked = !lastCheckedAt;

    // Count real active faults (only meaningful when fresh)
    const activeFaults =
      dtc01a || (!stale && !hasNeverBeenChecked)
        ? await this.prisma.vehicleDtcEvent.findMany({
            where: { vehicleId, isActive: true },
            select: { severity: true },
          })
        : [];

    const activeFaultCount = activeFaults.length;
    const faultConfirmation = dtc01a ? resolveFaultConfirmation(stale) : undefined;

    const severityBands = activeFaults.map((f) =>
      normalizeDtcSeverityBand(f.severity),
    );
    const worstSeverityBand = maxDtcSeverityBand(severityBands);

    type DtcStatus = 'clean' | 'active_faults' | 'stale' | 'unavailable';
    let status: DtcStatus;
    let message: string;

    if (hasNeverBeenChecked) {
      status = 'unavailable';
      message = 'No DTC check has been performed yet';
    } else if (stale) {
      status = 'stale';
      message =
        dtc01a && activeFaultCount > 0
          ? 'DTC monitoring outdated — showing last known faults (unconfirmed)'
          : 'DTC monitoring status is outdated';
    } else if (activeFaultCount > 0) {
      status = 'active_faults';
      message = `${activeFaultCount} active fault code${activeFaultCount > 1 ? 's' : ''} detected`;
    } else {
      status = 'clean';
      message = 'No active fault codes';
    }

    return {
      status,
      activeFaultCount,
      activeFaultPreview:
        status === 'active_faults' || (dtc01a && stale && activeFaultCount > 0)
          ? previewFaults.map((f) => ({
              code: f.dtcCode,
              label: f.description ?? `DTC ${f.dtcCode}`,
              category: getDtcCategory(f.dtcCode),
              severity: getSeverityDisplay(f.severity),
              severityRaw: f.severity ?? null,
              severityBand: normalizeDtcSeverityBand(f.severity),
              ...(dtc01a
                ? { faultConfirmation: resolveFaultConfirmation(stale) }
                : {}),
            }))
          : [],
      worstSeverityBand:
        status === 'active_faults' || (dtc01a && stale && activeFaultCount > 0)
          ? worstSeverityBand
          : ('unknown' as DtcSeverityBand),
      lastCheckedAt: lastCheckedAt?.toISOString() ?? null,
      lastSuccessfulCheckAt: lastSuccessfulCheckAt?.toISOString() ?? null,
      lastSourceObservedAt: latestState?.sourceTimestamp?.toISOString() ?? null,
      isStale: stale,
      message,
      ...(dtc01a ? { faultConfirmation, dtc01aEnabled: true } : {}),
    };
  }

  // ── Detail — full data for the Detail Modal ──────────────────────────────────

  /**
   * Returns the full detail payload for the DTC Detail Modal:
   *  • currentFaults  — fresh active codes (empty if stale)
   *  • history        — all historical events for this vehicle
   *  • monitoring     — poll metadata for Section C of the modal
   */
  async getDetail(vehicleId: string) {
    const dtc01a = isDtc01aSafetyFoundationEnabled();
    const [activeFaults, allEvents, latestState] = await Promise.all([
      this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId, isActive: true },
        orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      }),
      this.prisma.vehicleDtcEvent.findMany({
        where: { vehicleId },
        orderBy: { firstSeenAt: 'desc' },
        // Cap full history returned to the detail modal so a vehicle with a
        // lifetime of thousands of events doesn't send megabytes of JSON.
        take: 500,
      }),
      this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: {
          lastDtcPollAt: true,
          lastDtcSuccessfulCheckAt: true,
          dtcPollStatus: true,
          dtcPollError: true,
          sourceTimestamp: true,
          providerFetchedAt: true,
        },
      }),
    ]);

    const lastSuccessfulCheckAt = latestState?.lastDtcSuccessfulCheckAt ?? null;
    const stale = isDataStale(lastSuccessfulCheckAt);

    const faultConfirmation = dtc01a ? resolveFaultConfirmation(stale) : undefined;

    const toDto = (e: {
      id: string;
      dtcCode: string;
      description: string | null;
      severity: DtcSeverity;
      isActive: boolean;
      firstSeenAt: Date;
      lastSeenAt: Date;
      clearedAt: Date | null;
      occurrenceCount: number;
    }) => ({
      id: e.id,
      code: e.dtcCode,
      label: e.description ?? `DTC ${e.dtcCode}`,
      category: getDtcCategory(e.dtcCode),
      severity: getSeverityDisplay(e.severity),
      severityRaw: e.severity,
      isActive: e.isActive,
      firstSeenAt: e.firstSeenAt?.toISOString() ?? null,
      lastSeenAt: e.lastSeenAt?.toISOString() ?? null,
      clearedAt: e.clearedAt?.toISOString() ?? null,
      /**
       * Legacy column: under DTC-01A this counts fault *episodes* (first activation per active row),
       * not poll observations. Historical rows may still reflect pre-01A poll-increment semantics.
       */
      occurrenceCount: e.occurrenceCount ?? 1,
      ...(dtc01a && e.isActive ? { faultConfirmation } : {}),
    });

    type CurrentStatus = 'clean' | 'active_faults' | 'stale' | 'unavailable';
    let currentStatus: CurrentStatus;
    if (!latestState?.lastDtcPollAt) {
      currentStatus = 'unavailable';
    } else if (stale) {
      currentStatus = 'stale';
    } else if (activeFaults.length > 0) {
      currentStatus = 'active_faults';
    } else {
      currentStatus = 'clean';
    }

    const exposeActiveWhenStale = dtc01a && stale && activeFaults.length > 0;

    return {
      currentFaults: {
        status: currentStatus,
        isStale: stale,
        activeFaults:
          stale && !exposeActiveWhenStale ? [] : activeFaults.map(toDto),
        ...(dtc01a ? { faultConfirmation, dtc01aEnabled: true } : {}),
      },
      history: allEvents.map(toDto),
      monitoring: {
        pollIntervalHours: 3,
        staleThresholdHours: 6,
        lastCheckedAt: latestState?.lastDtcPollAt?.toISOString() ?? null,
        lastSuccessfulCheckAt: lastSuccessfulCheckAt?.toISOString() ?? null,
        lastSourceObservedAt: latestState?.sourceTimestamp?.toISOString() ?? null,
        lastProviderFetchAt: latestState?.providerFetchedAt?.toISOString() ?? null,
        pollStatus: latestState?.dtcPollStatus ?? null,
        pollError: latestState?.dtcPollError ?? null,
        isStale: stale,
        signalSource: 'obdDTCList',
        ...(dtc01a ? { dtc01aEnabled: true } : {}),
      },
    };
  }

  // ── Mutations ───────────────────────────────────────────────────────────────

  /**
   * Upsert a DTC code for a vehicle.
   * If the code is already active: update lastSeenAt; increment occurrenceCount only in legacy mode.
   * If the code is new (or was previously cleared): create a fresh active row (occurrenceCount = 1).
   */
  async upsertDtc(
    vehicleId: string,
    dtcCode: string,
    options?: {
      description?: string;
      severity?: DtcSeverity;
      producerContext?: BrakeDtcProducerContext;
      /** DTC-01A: count episodes, not poll observations. */
      episodeOccurrenceSemantics?: boolean;
      sourceObservedAt?: Date;
      prisma?: Prisma.TransactionClient;
      deferDownstreamSideEffects?: boolean;
    },
  ) {
    const db = options?.prisma ?? this.prisma;
    const now = options?.sourceObservedAt ?? new Date();
    const legacyIncrement = !options?.episodeOccurrenceSemantics;
    const existing = await db.vehicleDtcEvent.findFirst({
      where: { vehicleId, dtcCode, isActive: true },
    });

    let event;
    if (existing) {
      event = await db.vehicleDtcEvent.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          ...(legacyIncrement ? { occurrenceCount: { increment: 1 } } : {}),
          ...(options?.description ? { description: options.description } : {}),
          ...(options?.severity ? { severity: options.severity } : {}),
        },
      });
    } else {
      try {
        event = await db.vehicleDtcEvent.create({
          data: {
            vehicle: { connect: { id: vehicleId } },
            dtcCode,
            description: options?.description ?? null,
            severity: options?.severity ?? 'WARNING',
            firstSeenAt: now,
            lastSeenAt: now,
            occurrenceCount: 1,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          const raced = await db.vehicleDtcEvent.findFirst({
            where: { vehicleId, dtcCode, isActive: true },
          });
          if (!raced) throw err;
          event = await db.vehicleDtcEvent.update({
            where: { id: raced.id },
            data: {
              lastSeenAt: now,
              ...(legacyIncrement ? { occurrenceCount: { increment: 1 } } : {}),
              ...(options?.description ? { description: options.description } : {}),
              ...(options?.severity ? { severity: options.severity } : {}),
            },
          });
        } else {
          throw err;
        }
      }
    }

    if (!options?.deferDownstreamSideEffects) {
      await this.runEpisodeSideEffectsAfterCommit(
        vehicleId,
        dtcCode,
        'upsert',
        options?.producerContext,
        event,
      );
    }

    return event;
  }

  async runEpisodeSideEffectsAfterCommit(
    vehicleId: string,
    dtcCode: string,
    kind: 'upsert' | 'clear',
    producerContext?: BrakeDtcProducerContext | null,
    eventHint?: VehicleDtcEvent,
  ): Promise<void> {
    if (!producerContext) return;

    if (kind === 'upsert') {
      const event =
        eventHint ??
        (await this.prisma.vehicleDtcEvent.findFirst({
          where: { vehicleId, dtcCode, isActive: true },
        }));
      if (!event) return;
      await this.brakeDtcProducer?.onDtcUpserted(vehicleId, event, producerContext);
      const orgId = producerContext.organizationId;
      if (orgId) {
        await this.findingBridge?.syncDtcActive({
          organizationId: orgId,
          vehicleId,
          dtcCode,
          severity: event.severity,
          description: event.description,
          sourceRef: event.id,
        });
      }
    } else {
      const clearedAt = new Date();
      await this.brakeDtcProducer?.onDtcCleared(
        vehicleId,
        dtcCode,
        clearedAt,
        producerContext,
      );
      const orgId = producerContext.organizationId;
      if (orgId) {
        await this.findingBridge?.resolveDtc({
          organizationId: orgId,
          vehicleId,
          dtcCode,
        });
      }
    }

    await this.invalidateRentalHealthCache(vehicleId);
  }

  private async invalidateRentalHealthCache(vehicleId: string): Promise<void> {
    if (!this.rentalHealthSummaryCache) return;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (vehicle?.organizationId) {
      await this.rentalHealthSummaryCache.invalidate(
        vehicle.organizationId,
        vehicleId,
      );
    }
  }

  async clearDtc(
    vehicleId: string,
    dtcCode: string,
    options?: {
      producerContext?: BrakeDtcProducerContext;
      prisma?: Prisma.TransactionClient;
      deferDownstreamSideEffects?: boolean;
    },
  ) {
    const db = options?.prisma ?? this.prisma;
    const clearedAt = new Date();
    const result = await db.vehicleDtcEvent.updateMany({
      where: { vehicleId, dtcCode, isActive: true },
      data: { isActive: false, clearedAt },
    });

    if (result.count > 0 && !options?.deferDownstreamSideEffects) {
      await this.runEpisodeSideEffectsAfterCommit(
        vehicleId,
        dtcCode,
        'clear',
        options?.producerContext,
      );
    }

    return result;
  }

  async clearAllActive(vehicleId: string) {
    return this.prisma.vehicleDtcEvent.updateMany({
      where: { vehicleId, isActive: true },
      data: { isActive: false, clearedAt: new Date() },
    });
  }
}
