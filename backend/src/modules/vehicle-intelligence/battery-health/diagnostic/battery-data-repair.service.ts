import { Injectable, Logger } from '@nestjs/common';
import {
  BatteryMeasurementType,
  Prisma,
  ReferenceCapacityVerificationStatus,
  SohPublicationState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC } from '../battery-lv-semantics';
import { DEFAULT_WAKE_VOLTAGE_THRESHOLD_V } from '../lv-rest-window/lv-rest-window.policy';
import {
  LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE,
  LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT,
} from '../lv-assessment/lv-publication-thresholds';
import { BatteryDataDiagnosticService } from './battery-data-diagnostic.service';
import type { BatteryDiagnosticFinding } from './battery-data-diagnostic.types';
import { BATTERY_DATA_REPAIR_SCRIPT_VERSION } from './battery-data-repair.types';
import {
  chunkItems,
  hasRepairApplied,
  mergeRepairMetadata,
  parseJsonRecord,
  snapshotsAreIdentical,
} from './battery-data-repair.util';
import type {
  BatteryRepairAction,
  BatteryRepairActionId,
  BatteryRepairAuditLogEntry,
  BatteryRepairMetadata,
  BatteryRepairReport,
  BatteryRepairRunOptions,
  BatteryRepairSkipped,
  BatteryRepairUnresolved,
} from './battery-data-repair.types';

const DEFAULT_BATCH_SIZE = 20;

const REPAIRABLE_CHECK_TO_ACTION: Partial<
  Record<BatteryDiagnosticFinding['checkId'], BatteryRepairActionId>
> = {
  lv_wrong_soh_percent_evidence: 'reclassify_lv_soh_percent_evidence',
  rest_voltage_above_wake_threshold: 'mark_rest_measurement_unverified',
  rest_voltage_above_charging_context: 'mark_rest_measurement_unverified',
  rest_after_trip_start: 'mark_rest_measurement_unverified',
  stable_publication_without_evidence: 'reset_unsafe_publication',
  bev_with_ice_crank: 'clear_crank_readiness_fields',
  hv_persistence_duplicate: 'dedupe_hv_snapshots',
  unverified_reference_capacity: 'mark_reference_capacity_unverified',
};

@Injectable()
export class BatteryDataRepairService {
  private readonly logger = new Logger(BatteryDataRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly diagnostic: BatteryDataDiagnosticService,
  ) {}

  async runRepair(options: BatteryRepairRunOptions = {}): Promise<BatteryRepairReport> {
    const apply = options.apply === true;
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const referenceNow = options.referenceNow ?? new Date();

    const orgIds = options.organizationId
      ? [options.organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true } })).map((o) => o.id);

    const diagnosticBefore = await this.diagnostic.runDiagnostic({
      organizationId: options.organizationId,
      vehicleId: options.vehicleId,
      referenceNow,
      includeFindings: true,
    });

    const actions: BatteryRepairAction[] = [];
    const unresolved: BatteryRepairUnresolved[] = [];
    const skipped: BatteryRepairSkipped[] = [];
    const auditLog: BatteryRepairAuditLogEntry[] = [];
    let vehiclesScanned = 0;
    let errorCount = 0;

    const log = (
      level: BatteryRepairAuditLogEntry['level'],
      message: string,
      meta?: { actionId?: BatteryRepairActionId; vehicleId?: string; entityId?: string },
    ) => {
      auditLog.push({ at: new Date().toISOString(), level, message, ...meta });
    };

    log('info', `Battery repair started (dryRun=${!apply}, apply=${apply}, batchSize=${batchSize})`);

    for (const organizationId of orgIds) {
      const vehicleCount = await this.prisma.vehicle.count({
        where: {
          organizationId,
          ...(options.vehicleId ? { id: options.vehicleId } : {}),
        },
      });
      vehiclesScanned += vehicleCount;

      const findings =
        diagnosticBefore.findings?.filter((f) => f.organizationId === organizationId) ?? [];

      for (const finding of findings) {
        const actionId = REPAIRABLE_CHECK_TO_ACTION[finding.checkId];
        if (!actionId) {
          unresolved.push({
            organizationId,
            vehicleId: finding.vehicleId,
            rule: finding.checkId,
            reason: 'No automated repair action — manual review required',
            details: finding.details as Record<string, string | number | boolean | null>,
          });
          continue;
        }

        const planned = await this.planActionFromFinding(
          organizationId,
          finding,
          actionId,
          skipped,
        );
        if (planned) actions.push(planned);
      }

      actions.push(
        ...(await this.planLegacyRestFeatureClearing(organizationId, options.vehicleId, skipped)),
      );
      actions.push(
        ...(await this.planCrankClearingFromFeatures(organizationId, options.vehicleId, skipped)),
      );
    }

    const dedupedActions = this.dedupeActions(actions);

    if (!apply) {
      log('info', `Dry-run: planned ${dedupedActions.length} action(s)`);
    } else {
      for (const batch of chunkItems(dedupedActions, batchSize)) {
        for (const action of batch) {
          try {
            await this.applyAction(action, referenceNow);
            action.applied = true;
            log('action', action.description, {
              actionId: action.actionId,
              vehicleId: action.vehicleId,
              entityId: action.entityId,
            });
          } catch (err: unknown) {
            errorCount += 1;
            const message = err instanceof Error ? err.message : String(err);
            log('error', `Failed ${action.actionId} on ${action.entityId}: ${message}`, {
              actionId: action.actionId,
              vehicleId: action.vehicleId,
              entityId: action.entityId,
            });
            this.logger.error(
              `Battery repair action failed: ${action.actionId} ${action.entityId}`,
              err as Error,
            );
          }
        }
      }
    }

    const diagnosticAfter = apply
      ? await this.diagnostic.runDiagnostic({
          organizationId: options.organizationId,
          vehicleId: options.vehicleId,
          referenceNow,
          includeFindings: false,
        })
      : undefined;

    const byAction: Partial<Record<BatteryRepairActionId, number>> = {};
    for (const action of dedupedActions) {
      byAction[action.actionId] = (byAction[action.actionId] ?? 0) + 1;
    }

    return {
      mode: 'repair',
      dryRun: !apply,
      apply,
      scriptVersion: BATTERY_DATA_REPAIR_SCRIPT_VERSION,
      generatedAt: new Date().toISOString(),
      organizationId: options.organizationId ?? null,
      vehicleId: options.vehicleId ?? null,
      organizationCount: orgIds.length,
      vehiclesScanned,
      summary: {
        planned: dedupedActions.length,
        applied: dedupedActions.filter((a) => a.applied).length,
        skipped: skipped.length,
        unresolved: unresolved.length,
        errors: errorCount,
        byAction,
      },
      actions: dedupedActions,
      unresolved,
      skipped,
      auditLog,
      diagnosticBefore,
      diagnosticAfter,
    };
  }

  private dedupeActions(actions: BatteryRepairAction[]): BatteryRepairAction[] {
    const seen = new Set<string>();
    const result: BatteryRepairAction[] = [];
    for (const action of actions) {
      const key = `${action.actionId}:${action.entityType}:${action.entityId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(action);
    }
    return result;
  }

  private buildRepairMeta(
    actionId: BatteryRepairActionId,
    referenceNow: Date,
    extra?: Partial<BatteryRepairMetadata>,
  ): BatteryRepairMetadata {
    return {
      scriptVersion: BATTERY_DATA_REPAIR_SCRIPT_VERSION,
      actionId,
      appliedAt: referenceNow.toISOString(),
      ...extra,
    };
  }

  private async planActionFromFinding(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    actionId: BatteryRepairActionId,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    switch (actionId) {
      case 'reclassify_lv_soh_percent_evidence':
        return this.planReclassifyLvSohEvidence(organizationId, finding, skipped);
      case 'mark_rest_measurement_unverified':
        return this.planMarkRestUnverified(organizationId, finding, skipped);
      case 'reset_unsafe_publication':
        return this.planResetUnsafePublication(organizationId, finding, skipped);
      case 'clear_crank_readiness_fields':
        return this.planClearCrankFields(organizationId, finding, skipped);
      case 'dedupe_hv_snapshots':
        return this.planDedupeHvSnapshots(organizationId, finding, skipped);
      case 'mark_reference_capacity_unverified':
        return this.planMarkReferenceUnverified(organizationId, finding, skipped);
      default:
        return null;
    }
  }

  private async planReclassifyLvSohEvidence(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    const evidenceId = String(finding.details?.evidenceId ?? '');
    if (!evidenceId) return null;

    const row = await this.prisma.batteryEvidence.findFirst({
      where: { id: evidenceId, vehicleId: finding.vehicleId },
    });
    if (!row) return null;

    const metadata = parseJsonRecord(row.metadataJson);
    if (hasRepairApplied(metadata, 'reclassify_lv_soh_percent_evidence')) {
      skipped.push({
        organizationId,
        vehicleId: finding.vehicleId,
        entityId: evidenceId,
        rule: 'reclassify_lv_soh_percent_evidence',
        reason: 'Already repaired (idempotent skip)',
      });
      return null;
    }

    return {
      actionId: 'reclassify_lv_soh_percent_evidence',
      organizationId,
      vehicleId: finding.vehicleId,
      entityType: 'battery_evidence',
      entityId: evidenceId,
      diagnosticCheckId: finding.checkId,
      description: `Reclassify LV SOH_PERCENT evidence ${evidenceId} as ${LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC} (superseded for publication)`,
      before: {
        valueType: row.valueType,
        quality: row.quality,
        metadataJson: row.metadataJson,
      },
      after: {
        valueType: row.valueType,
        quality: 'SUPERSEDED',
        semanticReclassification: LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
      },
      applied: false,
    };
  }

  private async planMarkRestUnverified(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    const measurementId = String(finding.details?.measurementId ?? '');
    if (!measurementId) return null;

    const row = await this.prisma.batteryMeasurement.findFirst({
      where: { id: measurementId, organizationId, vehicleId: finding.vehicleId },
    });
    if (!row) return null;
    if (
      !row.type.startsWith('REST_') &&
      row.type !== BatteryMeasurementType.REST_AFTER_SHUTDOWN
    ) {
      return null;
    }

    const context = parseJsonRecord(row.context);
    if (hasRepairApplied(context, 'mark_rest_measurement_unverified')) {
      skipped.push({
        organizationId,
        vehicleId: finding.vehicleId,
        entityId: measurementId,
        rule: 'mark_rest_measurement_unverified',
        reason: 'Already repaired (idempotent skip)',
      });
      return null;
    }

    return {
      actionId: 'mark_rest_measurement_unverified',
      organizationId,
      vehicleId: finding.vehicleId,
      entityType: 'battery_measurement',
      entityId: measurementId,
      diagnosticCheckId: finding.checkId,
      description: `Mark REST measurement ${measurementId} as UNVERIFIED (legacy/contaminated)`,
      before: { quality: row.quality, context: row.context },
      after: { verificationStatus: 'UNVERIFIED', diagnosticCheck: finding.checkId },
      applied: false,
    };
  }

  private async planResetUnsafePublication(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    const publicationId = finding.details?.publicationId
      ? String(finding.details.publicationId)
      : null;

    if (publicationId) {
      const pub = await this.prisma.batteryPublication.findFirst({
        where: { id: publicationId, organizationId, vehicleId: finding.vehicleId },
      });
      if (!pub) return null;

      let payload: Record<string, unknown> = {};
      if (pub.reason) {
        try {
          payload = parseJsonRecord(JSON.parse(pub.reason) as unknown);
        } catch {
          payload = {};
        }
      }
      if (payload.maturity === 'SUPERSEDED' || hasRepairApplied(payload, 'reset_unsafe_publication')) {
        skipped.push({
          organizationId,
          vehicleId: finding.vehicleId,
          entityId: publicationId,
          rule: 'reset_unsafe_publication',
          reason: 'Publication already superseded',
        });
        return null;
      }

      return {
        actionId: 'reset_unsafe_publication',
        organizationId,
        vehicleId: finding.vehicleId,
        entityType: 'battery_publication',
        entityId: publicationId,
        diagnosticCheckId: finding.checkId,
        description: `Supersede unsafe STABLE publication ${publicationId}`,
        before: { status: pub.status, reason: pub.reason },
        after: { maturity: 'SUPERSEDED', publicationState: SohPublicationState.INITIAL_CALIBRATION },
        applied: false,
      };
    }

    const features = await this.prisma.batteryFeatures.findUnique({
      where: { vehicleId: finding.vehicleId },
    });
    if (!features || features.publicationState !== SohPublicationState.STABLE) {
      return null;
    }

    const validCount = await this.prisma.batteryMeasurement.count({
      where: {
        vehicleId: finding.vehicleId,
        quality: { in: ['VALID', 'VALID_PROXY'] },
      },
    });
    if (
      features.qualifiedEventCount >= LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT &&
      features.restObservationCount >= LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE &&
      validCount >= LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT
    ) {
      return null;
    }

    return {
      actionId: 'reset_unsafe_publication',
      organizationId,
      vehicleId: finding.vehicleId,
      entityType: 'battery_features',
      entityId: features.id,
      diagnosticCheckId: finding.checkId,
      description: `Reset battery_features publication from STABLE to INITIAL_CALIBRATION for vehicle ${finding.vehicleId}`,
      before: {
        publicationState: features.publicationState,
        publishedSohPct: features.publishedSohPct,
      },
      after: {
        publicationState: SohPublicationState.INITIAL_CALIBRATION,
        publishedSohPct: features.publishedSohPct,
      },
      applied: false,
    };
  }

  private async planClearCrankFields(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    const features = await this.prisma.batteryFeatures.findUnique({
      where: { vehicleId: finding.vehicleId },
    });
    if (!features || (features.crankAt == null && features.crankTripId == null)) {
      return null;
    }

    return {
      actionId: 'clear_crank_readiness_fields',
      organizationId,
      vehicleId: finding.vehicleId,
      entityType: 'battery_features',
      entityId: features.id,
      diagnosticCheckId: finding.checkId,
      description: `Clear legacy crank fields on battery_features for BEV/invalid crank (${finding.vehicleId})`,
      before: {
        crankAt: features.crankAt?.toISOString() ?? null,
        crankTripId: features.crankTripId,
        vMinCrank: features.vMinCrank,
      },
      after: {
        crankAt: null,
        crankTripId: null,
        vMinCrank: null,
        crankDrop: null,
      },
      applied: false,
    };
  }

  private async planDedupeHvSnapshots(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    const idempotencyKey = finding.details?.idempotencyKey
      ? String(finding.details.idempotencyKey)
      : null;
    const recordedAt = finding.details?.recordedAt
      ? new Date(String(finding.details.recordedAt))
      : null;

    const rows = await this.prisma.hvBatteryHealthSnapshot.findMany({
      where: {
        vehicleId: finding.vehicleId,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(recordedAt ? { recordedAt } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    if (rows.length < 2) return null;

    const canonical = rows[0];
    const duplicates = rows.slice(1).filter((row) => snapshotsAreIdentical(canonical, row));
    if (duplicates.length === 0) {
      skipped.push({
        organizationId,
        vehicleId: finding.vehicleId,
        rule: 'dedupe_hv_snapshots',
        reason: 'Duplicate group not strictly identical — manual review required',
      });
      return null;
    }

    const duplicateId = duplicates[0].id;
    return {
      actionId: 'dedupe_hv_snapshots',
      organizationId,
      vehicleId: finding.vehicleId,
      entityType: 'hv_battery_health_snapshot',
      entityId: duplicateId,
      diagnosticCheckId: finding.checkId,
      description: `Remove identical HV snapshot duplicate ${duplicateId} (keep ${canonical.id})`,
      before: { duplicateId, canonicalId: canonical.id, count: duplicates.length + 1 },
      after: { keptId: canonical.id, removedIds: duplicates.map((d) => d.id) },
      applied: false,
    };
  }

  private async planMarkReferenceUnverified(
    organizationId: string,
    finding: BatteryDiagnosticFinding,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction | null> {
    const referenceCapacityId = String(finding.details?.referenceCapacityId ?? '');
    if (!referenceCapacityId) return null;

    const row = await this.prisma.vehicleBatteryReferenceCapacity.findFirst({
      where: { id: referenceCapacityId, organizationId, vehicleId: finding.vehicleId },
    });
    if (!row || !row.isActive) return null;
    if (row.verificationStatus === ReferenceCapacityVerificationStatus.VERIFIED) {
      skipped.push({
        organizationId,
        vehicleId: finding.vehicleId,
        entityId: referenceCapacityId,
        rule: 'mark_reference_capacity_unverified',
        reason: 'Reference capacity is VERIFIED — not downgraded by repair script',
      });
      return null;
    }
    if (row.verificationStatus === ReferenceCapacityVerificationStatus.UNVERIFIED) {
      skipped.push({
        organizationId,
        vehicleId: finding.vehicleId,
        entityId: referenceCapacityId,
        rule: 'mark_reference_capacity_unverified',
        reason: 'Already UNVERIFIED (idempotent skip)',
      });
      return null;
    }

    return {
      actionId: 'mark_reference_capacity_unverified',
      organizationId,
      vehicleId: finding.vehicleId,
      entityType: 'vehicle_battery_reference_capacity',
      entityId: referenceCapacityId,
      diagnosticCheckId: finding.checkId,
      description: `Mark reference capacity ${referenceCapacityId} as UNVERIFIED`,
      before: { verificationStatus: row.verificationStatus },
      after: { verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED },
      applied: false,
    };
  }

  private async planLegacyRestFeatureClearing(
    organizationId: string,
    vehicleId: string | undefined,
    skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction[]> {
    const actions: BatteryRepairAction[] = [];
    const features = await this.prisma.batteryFeatures.findMany({
      where: {
        vehicle: { organizationId, ...(vehicleId ? { id: vehicleId } : {}) },
        OR: [{ vOff60m: { not: null } }, { vOff6h: { not: null } }],
      },
    });

    for (const feature of features) {
      const suspectVoltage =
        (feature.vOff60m != null && feature.vOff60m >= DEFAULT_WAKE_VOLTAGE_THRESHOLD_V) ||
        (feature.vOff6h != null && feature.vOff6h >= DEFAULT_WAKE_VOLTAGE_THRESHOLD_V);

      if (!suspectVoltage) continue;

      const hasValidRest = await this.prisma.batteryMeasurement.count({
        where: {
          vehicleId: feature.vehicleId,
          type: { in: [BatteryMeasurementType.REST_60M, BatteryMeasurementType.REST_6H] },
          quality: { in: ['VALID', 'VALID_PROXY'] },
        },
      });
      if (hasValidRest > 0) continue;

      actions.push({
        actionId: 'mark_rest_measurement_unverified',
        organizationId,
        vehicleId: feature.vehicleId,
        entityType: 'battery_features',
        entityId: feature.id,
        description: `Clear legacy unverified REST feature voltages on battery_features ${feature.id}`,
        before: {
          vOff60m: feature.vOff60m,
          vOff6h: feature.vOff6h,
          rest60mCapturedAt: feature.rest60mCapturedAt?.toISOString() ?? null,
        },
        after: {
          vOff60m: null,
          vOff6h: null,
          rest60mCapturedAt: null,
          rest6hCapturedAt: null,
          verificationStatus: 'UNVERIFIED',
        },
        applied: false,
      });
    }

    return actions;
  }

  private async planCrankClearingFromFeatures(
    organizationId: string,
    vehicleId: string | undefined,
    _skipped: BatteryRepairSkipped[],
  ): Promise<BatteryRepairAction[]> {
    const actions: BatteryRepairAction[] = [];
    const rows = await this.prisma.batteryFeatures.findMany({
      where: {
        vehicle: { organizationId, ...(vehicleId ? { id: vehicleId } : {}) },
        crankAt: { not: null },
      },
      include: {
        vehicle: {
          select: {
            hvBatteryCapacityKwh: true,
            latestState: { select: { evSoc: true } },
          },
        },
      },
    });

    for (const feature of rows) {
      const isBev =
        feature.vehicle.hvBatteryCapacityKwh != null ||
        feature.vehicle.latestState?.evSoc != null;
      if (!isBev) continue;

      actions.push({
        actionId: 'clear_crank_readiness_fields',
        organizationId,
        vehicleId: feature.vehicleId,
        entityType: 'battery_features',
        entityId: feature.id,
        description: `Clear crank readiness fields on BEV battery_features ${feature.id}`,
        before: { crankAt: feature.crankAt?.toISOString() ?? null },
        after: { crankAt: null, crankTripId: null },
        applied: false,
      });
    }

    return actions;
  }

  private async applyAction(action: BatteryRepairAction, referenceNow: Date): Promise<void> {
    const meta = this.buildRepairMeta(action.actionId, referenceNow);

    switch (action.actionId) {
      case 'reclassify_lv_soh_percent_evidence':
        await this.applyReclassifyLvSohEvidence(action, meta);
        break;
      case 'mark_rest_measurement_unverified':
        if (action.entityType === 'battery_features') {
          await this.applyClearLegacyRestFeatures(action, meta);
        } else {
          await this.applyMarkRestUnverified(action, meta);
        }
        break;
      case 'reset_unsafe_publication':
        await this.applyResetUnsafePublication(action, meta);
        break;
      case 'clear_crank_readiness_fields':
        await this.applyClearCrankFields(action, meta);
        break;
      case 'dedupe_hv_snapshots':
        await this.applyDedupeHvSnapshots(action);
        break;
      case 'mark_reference_capacity_unverified':
        await this.applyMarkReferenceUnverified(action, meta);
        break;
      default:
        throw new Error(`Unknown action ${action.actionId}`);
    }
  }

  private async applyReclassifyLvSohEvidence(
    action: BatteryRepairAction,
    meta: BatteryRepairMetadata,
  ): Promise<void> {
    const row = await this.prisma.batteryEvidence.findUniqueOrThrow({
      where: { id: action.entityId },
    });
    const metadata = parseJsonRecord(row.metadataJson);
    await this.prisma.batteryEvidence.update({
      where: { id: action.entityId },
      data: {
        quality: 'SUPERSEDED',
        metadataJson: mergeRepairMetadata(metadata, {
          ...meta,
          reclassifiedAs: LEGACY_ESTIMATED_LV_HEALTH_SEMANTIC,
          superseded: true,
        }) as Prisma.InputJsonValue,
      },
    });
  }

  private async applyMarkRestUnverified(
    action: BatteryRepairAction,
    meta: BatteryRepairMetadata,
  ): Promise<void> {
    const row = await this.prisma.batteryMeasurement.findUniqueOrThrow({
      where: { id: action.entityId },
    });
    const context = parseJsonRecord(row.context);
    await this.prisma.batteryMeasurement.update({
      where: { id: action.entityId },
      data: {
        context: mergeRepairMetadata(context, {
          ...meta,
          verificationStatus: 'UNVERIFIED',
        }) as Prisma.InputJsonValue,
      },
    });
  }

  private async applyClearLegacyRestFeatures(
    action: BatteryRepairAction,
    meta: BatteryRepairMetadata,
  ): Promise<void> {
    await this.prisma.batteryFeatures.update({
      where: { id: action.entityId },
      data: {
        vOff60m: null,
        vOff6h: null,
        rest60mCapturedAt: null,
        rest6hCapturedAt: null,
        deltaVRest: null,
      },
    });
    this.logger.log(
      `Cleared legacy REST features ${action.entityId} repair=${JSON.stringify(meta)}`,
    );
  }

  private async applyResetUnsafePublication(
    action: BatteryRepairAction,
    meta: BatteryRepairMetadata,
  ): Promise<void> {
    if (action.entityType === 'battery_publication') {
      const existing = await this.prisma.batteryPublication.findUniqueOrThrow({
        where: { id: action.entityId },
      });
      let payload: Record<string, unknown> = {};
      if (existing.reason) {
        try {
          payload = parseJsonRecord(JSON.parse(existing.reason) as unknown);
        } catch {
          payload = {};
        }
      }
      await this.prisma.batteryPublication.update({
        where: { id: action.entityId },
        data: {
          reason: JSON.stringify({
            ...payload,
            batteryDataRepair: meta,
            maturity: 'SUPERSEDED',
            superseded: true,
            supersededByRepair: true,
          }),
        },
      });
    }

    if (
      action.entityType === 'battery_features' ||
      action.entityType === 'battery_publication'
    ) {
      await this.prisma.batteryFeatures.updateMany({
        where: { vehicleId: action.vehicleId },
        data: {
          publicationState: SohPublicationState.INITIAL_CALIBRATION,
        },
      });
    }
  }

  private async applyClearCrankFields(
    action: BatteryRepairAction,
    meta: BatteryRepairMetadata,
  ): Promise<void> {
    await this.prisma.batteryFeatures.update({
      where: { id: action.entityId },
      data: {
        crankTripId: null,
        crankAt: null,
        vPreCrank: null,
        vMinCrank: null,
        crankDrop: null,
        vRecovery5s: null,
        vRecovery30s: null,
      },
    });
    this.logger.log(`Cleared crank fields ${action.entityId} repair=${JSON.stringify(meta)}`);
  }

  private async applyDedupeHvSnapshots(action: BatteryRepairAction): Promise<void> {
    const removedIds = Array.isArray(action.after.removedIds)
      ? (action.after.removedIds as string[])
      : [action.entityId];

    for (const id of removedIds) {
      await this.prisma.hvBatteryHealthSnapshot.delete({ where: { id } });
    }
  }

  private async applyMarkReferenceUnverified(
    action: BatteryRepairAction,
    meta: BatteryRepairMetadata,
  ): Promise<void> {
    const row = await this.prisma.vehicleBatteryReferenceCapacity.findUniqueOrThrow({
      where: { id: action.entityId },
    });

    await this.prisma.$transaction([
      this.prisma.vehicleBatteryReferenceCapacity.update({
        where: { id: action.entityId },
        data: {
          verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
          verifiedAt: null,
          verifiedByUserId: null,
        },
      }),
      this.prisma.vehicleBatteryReferenceCapacityChange.create({
        data: {
          organizationId: action.organizationId,
          vehicleId: action.vehicleId,
          referenceCapacityId: action.entityId,
          action: 'NOTES_UPDATED',
          previousStatus: row.verificationStatus,
          newStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
          metadata: {
            batteryDataRepair: meta,
            reason: 'repair_script_mark_unverified',
          } as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
  }
}
