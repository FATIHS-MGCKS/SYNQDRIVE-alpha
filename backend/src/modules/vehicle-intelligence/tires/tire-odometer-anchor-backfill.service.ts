import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentExtractionStatus,
  DocumentExtractionType,
  Prisma,
  TireEventType,
  TireOdometerAnchorStatus,
  TireSetupStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  auditSetupBackfillCandidate,
  isSetupMissingTraceableAnchor,
  type SetupBackfillAuditInput,
  type SetupBackfillAuditResult,
} from './tire-odometer-anchor-backfill-audit';
import {
  buildSetupAuditInputFromRaw,
  type RawHandoverRow,
  type RawHmRow,
  type RawMeasurementRow,
  type RawSetupRow,
  type RawSiblingSetupRow,
  type RawSnapshotRow,
  type RawTripRow,
  type RawWorkshopDocRow,
} from './tire-odometer-anchor-backfill-audit.loader';
import {
  buildAnchorApplyUpdate,
  buildBackfillEventPayload,
  buildMeasurementRequiredUpdate,
  DEFAULT_RECALCULATE_MAX_VEHICLES,
  planBackfillApply,
  validateBackfillApplyRequest,
  type BackfillApplyAuditEntry,
  type BackfillApplyPlan,
  type BackfillApplyRequest,
  type BackfillApplyResult,
} from './tire-odometer-anchor-backfill-apply';
import { assertSafeTireOdometerAnchorApplyTarget } from './tire-odometer-anchor-backfill-apply.safety';
import { TireHealthService } from './tire-health.service';

export interface TireOdometerAnchorBackfillRunOptions {
  request: BackfillApplyRequest;
  actualGitRef?: string;
  allowRemote?: boolean;
  allowProd?: boolean;
}

@Injectable()
export class TireOdometerAnchorBackfillService {
  private readonly logger = new Logger(TireOdometerAnchorBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tireHealthService: TireHealthService,
  ) {}

  async run(options: TireOdometerAnchorBackfillRunOptions): Promise<{
    plan: BackfillApplyPlan;
    result: BackfillApplyResult;
  }> {
    validateBackfillApplyRequest(options.request, {
      actualGitRef: options.actualGitRef,
    });

    if (options.request.apply) {
      assertSafeTireOdometerAnchorApplyTarget({
        allowRemote: options.allowRemote,
        allowProd: options.allowProd,
      });
    }

    const auditRows = await this.loadAuditRows(options.request);
    const setupIds = auditRows.map((r) => r.setupId);
    const [setupStatusById, alreadyAnchoredSetupIds, existingBackfillHashes] =
      await Promise.all([
        this.loadSetupStatusById(setupIds),
        this.loadAlreadyAnchoredSetupIds(setupIds),
        this.loadExistingBackfillHashes(setupIds),
      ]);

    const plan = planBackfillApply({
      auditRows,
      request: options.request,
      setupStatusById,
      alreadyAnchoredSetupIds,
      existingBackfillHashes,
    });

    if (!options.request.apply) {
      return {
        plan,
        result: {
          dryRun: true,
          applied: 0,
          measurementRequiredStatusSet: 0,
          skipped: plan.skipped.length,
          manualReviewCount: plan.manualReview.length,
          auditLog: [],
          recalculateVehicleIds: [],
          errors: [],
        },
      };
    }

    const result = await this.executeApply(plan, options.request);
    return { plan, result };
  }

  /** Test hook: plan from precomputed audit rows without DB load. */
  planFromAuditRows(
    auditRows: SetupBackfillAuditResult[],
    request: BackfillApplyRequest,
    ctx?: {
      setupStatusById?: Record<string, string>;
      alreadyAnchoredSetupIds?: Set<string>;
      existingBackfillHashes?: Set<string>;
    },
  ): BackfillApplyPlan {
    validateBackfillApplyRequest(request);
    return planBackfillApply({
      auditRows,
      request,
      setupStatusById: ctx?.setupStatusById,
      alreadyAnchoredSetupIds: ctx?.alreadyAnchoredSetupIds,
      existingBackfillHashes: ctx?.existingBackfillHashes,
    });
  }

  private async executeApply(
    plan: BackfillApplyPlan,
    request: BackfillApplyRequest,
  ): Promise<BackfillApplyResult> {
    const auditLog: BackfillApplyAuditEntry[] = [];
    const errors: string[] = [];
    let applied = 0;
    let measurementRequiredStatusSet = 0;
    const recalculateVehicleIds = new Set<string>();

    const toWrite = [
      ...plan.autoApplicable,
      ...(request.applyMeasurementRequiredStatus ? plan.measurementRequired : []),
    ];

    for (const item of toWrite) {
      try {
        const entry = await this.applyPlanItem(item, request, auditLog);
        auditLog.push(entry);
        if (item.action === 'APPLY_ANCHOR') {
          applied += 1;
          recalculateVehicleIds.add(item.vehicleId);
        } else if (item.action === 'SET_MEASUREMENT_REQUIRED') {
          measurementRequiredStatusSet += 1;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`setup ${item.setupId}: ${message}`);
        this.logger.error(`Backfill apply failed for ${item.setupId}: ${message}`);
      }
    }

    const recalcLimit = request.recalculateMaxVehicles ?? DEFAULT_RECALCULATE_MAX_VEHICLES;
    const recalcTargets = request.recalculate
      ? [...recalculateVehicleIds].slice(0, recalcLimit)
      : [];

    if (request.recalculate) {
      for (const vehicleId of recalcTargets) {
        try {
          await this.tireHealthService.recalculate(vehicleId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`recalculate ${vehicleId}: ${message}`);
        }
      }
    }

    return {
      dryRun: false,
      applied,
      measurementRequiredStatusSet,
      skipped: plan.skipped.length,
      manualReviewCount: plan.manualReview.length,
      auditLog,
      recalculateVehicleIds: recalcTargets,
      errors,
    };
  }

  private async applyPlanItem(
    item: BackfillApplyPlan['autoApplicable'][number],
    request: BackfillApplyRequest,
    priorAuditLog: BackfillApplyAuditEntry[],
  ): Promise<BackfillApplyAuditEntry> {
    const setup = await this.prisma.vehicleTireSetup.findUnique({
      where: { id: item.setupId },
      select: {
        id: true,
        vehicleId: true,
        organizationId: true,
        installedAt: true,
        status: true,
        odometerAnchorStatus: true,
        installedOdometerKm: true,
      },
    });
    if (!setup) {
      throw new Error('Setup not found.');
    }
    if (
      request.organizationId &&
      setup.organizationId !== request.organizationId
    ) {
      throw new Error('Cross-tenant setup rejected.');
    }
    if (
      setup.status === TireSetupStatus.REMOVED ||
      setup.status === TireSetupStatus.RETIRED ||
      setup.status === TireSetupStatus.DISCARDED ||
      setup.status === TireSetupStatus.SOLD
    ) {
      throw new Error(`Terminal setup status ${setup.status}.`);
    }
    if (
      setup.odometerAnchorStatus === TireOdometerAnchorStatus.ANCHORED &&
      setup.installedOdometerKm != null
    ) {
      throw new Error('Setup already has traceable anchor.');
    }

    const at = new Date().toISOString();
    const entryBase: BackfillApplyAuditEntry = {
      at,
      setupId: item.setupId,
      vehicleId: item.vehicleId,
      action: item.action,
      candidateHash: item.candidateHash,
      operator: request.operator,
      reason: request.reason,
    };

    await this.prisma.$transaction(async (tx) => {
      if (item.action === 'APPLY_ANCHOR') {
        const update = buildAnchorApplyUpdate(item);
        await tx.vehicleTireSetup.update({
          where: { id: item.setupId },
          data: update,
        });
        await this.upsertOpenMountPeriod(tx, setup, update);
      } else if (item.action === 'SET_MEASUREMENT_REQUIRED') {
        const update = buildMeasurementRequiredUpdate();
        await tx.vehicleTireSetup.update({
          where: { id: item.setupId },
          data: update,
        });
      } else {
        throw new Error(`Unsupported apply action ${item.action}`);
      }

      const organizationId = setup.organizationId ?? item.organizationId;
      if (!organizationId) {
        throw new Error('Setup missing organizationId for tire event.');
      }

      await tx.tireEvent.create({
        data: {
          organizationId,
          vehicleId: setup.vehicleId,
          tireSetId: setup.id,
          type: TireEventType.ODOMETER_ANCHOR_BACKFILLED,
          payload: buildBackfillEventPayload({
            item,
            operator: request.operator,
            reason: request.reason,
            auditLog: priorAuditLog,
          }) as Prisma.InputJsonValue,
          createdBy: request.operator,
        },
      });
    });

    return {
      ...entryBase,
      details: {
        candidateOdometerKm: item.candidateOdometerKm,
        source: item.source,
        confidence: item.confidence,
      },
    };
  }

  private async upsertOpenMountPeriod(
    tx: Prisma.TransactionClient,
    setup: {
      id: string;
      organizationId: string | null;
      installedAt: Date | null;
    },
    update: ReturnType<typeof buildAnchorApplyUpdate>,
  ): Promise<void> {
    const open = await tx.vehicleTireSetupMountPeriod.findFirst({
      where: { tireSetupId: setup.id, removedAt: null },
      orderBy: { installedAt: 'desc' },
    });
    if (open) {
      await tx.vehicleTireSetupMountPeriod.update({
        where: { id: open.id },
        data: {
          installedOdometerKm: update.installedOdometerKm,
          installedOdometerSource: update.installedOdometerSource,
          installedOdometerCapturedAt: update.installedOdometerCapturedAt,
          odometerAnchorStatus: update.odometerAnchorStatus,
          odometerAnchorConfidence: update.odometerAnchorConfidence,
        },
      });
      return;
    }

    await tx.vehicleTireSetupMountPeriod.create({
      data: {
        organizationId: setup.organizationId,
        tireSetupId: setup.id,
        installedAt: setup.installedAt ?? update.installedOdometerCapturedAt,
        installedOdometerKm: update.installedOdometerKm,
        installedOdometerSource: update.installedOdometerSource,
        installedOdometerCapturedAt: update.installedOdometerCapturedAt,
        odometerAnchorStatus: update.odometerAnchorStatus,
        odometerAnchorConfidence: update.odometerAnchorConfidence,
      },
    });
  }

  private async loadAuditRows(
    request: BackfillApplyRequest,
  ): Promise<SetupBackfillAuditResult[]> {
    const setups = await this.prisma.vehicleTireSetup.findMany({
      where: {
        ...(request.organizationId ? { organizationId: request.organizationId } : {}),
        ...(request.setupIds?.length ? { id: { in: request.setupIds } } : {}),
        OR: [
          { installedOdometerKm: null },
          { odometerAnchorStatus: TireOdometerAnchorStatus.ANCHOR_REQUIRED },
          { odometerAnchorStatus: TireOdometerAnchorStatus.MEASUREMENT_REQUIRED },
        ],
      },
      select: {
        id: true,
        vehicleId: true,
        organizationId: true,
        installedAt: true,
        status: true,
        installedOdometerKm: true,
        odometerAnchorStatus: true,
        totalKmOnSet: true,
      },
    });

    if (setups.length === 0) return [];

    const setupIds = setups.map((s) => s.id);
    const vehicleIds = [...new Set(setups.map((s) => s.vehicleId))];

    const [
      measurements,
      handovers,
      snapshots,
      trips,
      workshopDocs,
      hmRows,
      siblings,
      latestStates,
      tripSums,
    ] = await Promise.all([
      this.prisma.vehicleTireTreadMeasurement.findMany({
        where: { tireSetupId: { in: setupIds }, odometerAtMeasurement: { not: null } },
        select: {
          tireSetupId: true,
          id: true,
          measuredAt: true,
          source: true,
          odometerAtMeasurement: true,
        },
      }),
      this.prisma.bookingHandoverProtocol.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          id: true,
          performedAt: true,
          odometerKm: true,
        },
      }),
      this.prisma.tireHealthSnapshot.findMany({
        where: { vehicleId: { in: vehicleIds }, odometerKm: { not: null } },
        select: {
          vehicleId: true,
          id: true,
          snapshotDate: true,
          odometerKm: true,
        },
      }),
      this.prisma.vehicleEnergyEvent.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          odometerEndKm: { not: null },
        },
        select: {
          vehicleId: true,
          id: true,
          endTime: true,
          odometerEndKm: true,
        },
      }),
      this.prisma.vehicleDocumentExtraction.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          effectiveDocumentType: DocumentExtractionType.TIRE,
          status: { in: [DocumentExtractionStatus.CONFIRMED, DocumentExtractionStatus.APPLIED] },
        },
        select: {
          vehicleId: true,
          id: true,
          appliedAt: true,
          processedAt: true,
          extractionCompletedAt: true,
          confirmedData: true,
          extractedData: true,
        },
      }),
      this.prisma.hmSignalGroupState.findMany({
        where: {
          vehicleId: { in: vehicleIds },
          signalGroup: 'SERVICE',
        },
        select: {
          vehicleId: true,
          lastSuccessAt: true,
          lastFetchedAt: true,
          updatedAt: true,
          dataJson: true,
        },
      }),
      this.prisma.vehicleTireSetup.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: {
          vehicleId: true,
          id: true,
          installedAt: true,
          installedOdometerKm: true,
          status: true,
        },
      }),
      this.prisma.vehicleLatestState.findMany({
        where: { vehicleId: { in: vehicleIds } },
        select: { vehicleId: true, odometerKm: true, providerSource: true },
      }),
      this.loadTripsAfterInstallBySetup(setups),
    ]);

    const measurementRows: RawMeasurementRow[] = measurements.map((m) => ({
      setup_id: m.tireSetupId,
      measurement_id: m.id,
      measured_at: m.measuredAt.toISOString(),
      source: m.source,
      odometer_at_measurement: String(m.odometerAtMeasurement),
    }));

    const handoverRows: RawHandoverRow[] = handovers
      .filter((h) => h.odometerKm != null)
      .map((h) => ({
        vehicle_id: h.vehicleId,
        protocol_id: h.id,
        performed_at: h.performedAt.toISOString(),
        odometer_km: String(h.odometerKm),
      }));

    const latestByVehicle = new Map(latestStates.map((s) => [s.vehicleId, s]));

    const snapshotRows: RawSnapshotRow[] = snapshots.map((s) => {
      const latest = latestByVehicle.get(s.vehicleId);
      return {
        vehicle_id: s.vehicleId,
        snapshot_id: s.id,
        snapshot_date: s.snapshotDate.toISOString(),
        odometer_km: String(s.odometerKm),
        provider_source: latest?.providerSource ?? 'SNAPSHOT',
      };
    });

    const tripRows: RawTripRow[] = trips
      .filter((t) => t.odometerEndKm != null)
      .map((t) => ({
        vehicle_id: t.vehicleId,
        trip_id: t.id,
        end_time: t.endTime.toISOString(),
        odometer_end_km: String(t.odometerEndKm),
      }));

    const workshopRows: RawWorkshopDocRow[] = [];
    for (const d of workshopDocs) {
      const data = (d.confirmedData ?? d.extractedData) as Record<string, unknown> | null;
      const odometerKm = data?.odometerKm;
      const confirmedAt =
        d.appliedAt ?? d.processedAt ?? d.extractionCompletedAt ?? null;
      if (odometerKm == null || !d.vehicleId) continue;
      workshopRows.push({
        vehicle_id: d.vehicleId,
        extraction_id: d.id,
        confirmed_at: confirmedAt?.toISOString() ?? null,
        odometer_km: String(odometerKm).replace(/^"|"$/g, ''),
      });
    }

    const hmMapped: RawHmRow[] = [];
    for (const row of hmRows) {
      const data = row.dataJson as Record<string, unknown> | null;
      const signals = data?.signals as Record<string, unknown> | undefined;
      const odo = signals?.['diagnostics.get.odometer'] as Record<string, unknown> | undefined;
      const value = odo?.value;
      if (value == null) continue;
      const fetchedAt = row.lastSuccessAt ?? row.lastFetchedAt ?? row.updatedAt;
      hmMapped.push({
        vehicle_id: row.vehicleId,
        fetched_at: fetchedAt.toISOString(),
        odometer_km: String(value).replace(/^"|"$/g, ''),
      });
    }

    const siblingRows: RawSiblingSetupRow[] = siblings.map((s) => ({
      vehicle_id: s.vehicleId,
      setup_id: s.id,
      installed_at: s.installedAt?.toISOString() ?? null,
      installed_odometer_km:
        s.installedOdometerKm != null ? String(s.installedOdometerKm) : null,
      status: s.status,
    }));

    const inputs: SetupBackfillAuditInput[] = [];
    for (const setup of setups) {
      const rawSetup: RawSetupRow = {
        setup_id: setup.id,
        vehicle_id: setup.vehicleId,
        organization_id: setup.organizationId,
        installed_at: setup.installedAt?.toISOString() ?? null,
        status: setup.status,
        installed_odometer_km:
          setup.installedOdometerKm != null ? String(setup.installedOdometerKm) : null,
        odometer_anchor_status: setup.odometerAnchorStatus,
        total_km_on_set: String(setup.totalKmOnSet),
      };
      const input = buildSetupAuditInputFromRaw({
        setup: rawSetup,
        measurements: measurementRows,
        handovers: handoverRows,
        snapshots: snapshotRows,
        trips: tripRows,
        workshopDocs: workshopRows,
        hmRows: hmMapped,
        siblings: siblingRows,
        tripsAfterInstallKm: tripSums.get(setup.id),
      });
      if (isSetupMissingTraceableAnchor(input)) {
        inputs.push(input);
      }
    }

    return inputs.map((input) => auditSetupBackfillCandidate(input, 'backfill-service'));
  }

  private async loadTripsAfterInstallBySetup(
    setups: Array<{ id: string; vehicleId: string; installedAt: Date | null }>,
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    await Promise.all(
      setups.map(async (setup) => {
        if (!setup.installedAt) return;
        const agg = await this.prisma.vehicleTrip.aggregate({
          where: {
            vehicleId: setup.vehicleId,
            endTime: { not: null, gte: setup.installedAt },
          },
          _sum: { distanceKm: true },
        });
        const km = agg._sum.distanceKm;
        if (km != null && Number.isFinite(km)) {
          out.set(setup.id, km);
        }
      }),
    );
    return out;
  }

  private async loadSetupStatusById(
    setupIds: string[],
  ): Promise<Record<string, string>> {
    if (setupIds.length === 0) return {};
    const rows = await this.prisma.vehicleTireSetup.findMany({
      where: { id: { in: setupIds } },
      select: { id: true, status: true },
    });
    return Object.fromEntries(rows.map((r) => [r.id, r.status]));
  }

  private async loadAlreadyAnchoredSetupIds(setupIds: string[]): Promise<Set<string>> {
    if (setupIds.length === 0) return new Set();
    const rows = await this.prisma.vehicleTireSetup.findMany({
      where: {
        id: { in: setupIds },
        installedOdometerKm: { not: null },
        odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
      },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  private async loadExistingBackfillHashes(setupIds: string[]): Promise<Set<string>> {
    if (setupIds.length === 0) return new Set();
    const events = await this.prisma.tireEvent.findMany({
      where: {
        tireSetId: { in: setupIds },
        type: TireEventType.ODOMETER_ANCHOR_BACKFILLED,
      },
      select: { tireSetId: true, payload: true },
    });
    const hashes = new Set<string>();
    for (const event of events) {
      const payload = event.payload as Record<string, unknown> | null;
      const hash = payload?.candidateHash;
      if (event.tireSetId && typeof hash === 'string') {
        hashes.add(`${event.tireSetId}:${hash}`);
      }
    }
    return hashes;
  }
}
