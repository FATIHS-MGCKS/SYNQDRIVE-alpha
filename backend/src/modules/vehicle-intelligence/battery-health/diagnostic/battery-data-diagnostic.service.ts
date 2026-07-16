import { Injectable } from '@nestjs/common';
import {
  BatteryDriveProfile,
  BatteryMeasurementQuality,
  BatteryMeasurementSessionStatus,
  BatteryMeasurementSessionType,
  BatteryMeasurementType,
  ReferenceCapacityVerificationStatus,
  SohPublicationState,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE,
  LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT,
} from '../lv-assessment/lv-publication-thresholds';
import { DEFAULT_WAKE_VOLTAGE_THRESHOLD_V } from '../lv-rest-window/lv-rest-window.policy';
import {
  BATTERY_DATA_DIAGNOSTIC_SCRIPT_VERSION,
  BATTERY_DIAGNOSTIC_CHECK_META,
} from './battery-data-diagnostic-check-meta';
import { maskVehicleId } from './battery-data-diagnostic.safety.util';
import type {
  BatteryDiagnosticCategory,
  BatteryDiagnosticCheckId,
  BatteryDiagnosticFinding,
  BatteryDiagnosticReport,
  BatteryDiagnosticRunOptions,
  BatteryDiagnosticSeverity,
} from './battery-data-diagnostic.types';

const DEFAULT_SAMPLE_LIMIT = 25;

const REST_TARGET_TYPES = new Set<BatteryMeasurementType>([
  BatteryMeasurementType.REST_60M,
  BatteryMeasurementType.REST_6H,
]);

const NON_CONTAMINATED_REST_QUALITIES = new Set<BatteryMeasurementQuality>([
  BatteryMeasurementQuality.VALID,
  BatteryMeasurementQuality.VALID_PROXY,
  BatteryMeasurementQuality.SHADOW,
]);

const ICE_START_SESSION_TYPES = new Set<BatteryMeasurementSessionType>([
  BatteryMeasurementSessionType.ICE_START_PROXY,
  BatteryMeasurementSessionType.PHEV_ICE_START,
  BatteryMeasurementSessionType.LV_ICE_START,
]);

const INCOMPATIBLE_CYCLE_QUALITIES = new Set<BatteryMeasurementQuality>([
  BatteryMeasurementQuality.INSUFFICIENT_CADENCE,
  BatteryMeasurementQuality.TIMESTAMP_INCONSISTENT,
]);

const UNVERIFIED_REFERENCE_STATUSES: ReferenceCapacityVerificationStatus[] = [
  ReferenceCapacityVerificationStatus.UNVERIFIED,
  ReferenceCapacityVerificationStatus.PENDING_REVIEW,
  ReferenceCapacityVerificationStatus.WEAK_SOURCE_ONLY,
];

type VehicleScopeRow = {
  id: string;
  organizationId: string;
  driveProfile: BatteryDriveProfile | null;
  isLikelyBev: boolean;
};

@Injectable()
export class BatteryDataDiagnosticService {
  constructor(private readonly prisma: PrismaService) {}

  async runDiagnostic(options: BatteryDiagnosticRunOptions = {}): Promise<BatteryDiagnosticReport> {
    const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT;
    const referenceNow = options.referenceNow ?? new Date();
    const orgIds = await this.resolveOrganizationIds(options.organizationId);
    const findings: BatteryDiagnosticFinding[] = [];
    let vehiclesScanned = 0;

    for (const organizationId of orgIds) {
      const vehicles = await this.loadVehicles(organizationId, options.vehicleId);
      vehiclesScanned += vehicles.length;
      if (vehicles.length === 0) continue;

      const vehicleIds = vehicles.map((v) => v.id);
      const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

      findings.push(
        ...(await this.checkRestVoltageAboveWake(organizationId, vehicleIds)),
        ...(await this.checkRestChargingContext(organizationId, vehicleIds)),
        ...(await this.checkRest60m6hSameTimestamp(organizationId, vehicleIds)),
        ...(await this.checkRestAfterTripStart(organizationId, vehicleIds)),
        ...(await this.checkCrankInsufficientCoverage(organizationId, vehicleIds)),
        ...(await this.checkBevWithIceCrank(organizationId, vehicles)),
        ...(await this.checkLvWrongSohEvidence(organizationId, vehicleIds)),
        ...(await this.checkIncompatibleMeasurementCycles(organizationId, vehicleIds)),
        ...(await this.checkStablePublicationWithoutEvidence(organizationId, vehicleIds)),
        ...(await this.checkHvPersistenceDuplicates(organizationId, vehicleIds)),
        ...(await this.checkLegacyPairwiseCapacity(organizationId, vehicleIds)),
        ...(await this.checkUnverifiedReferenceCapacity(organizationId, vehicleIds)),
        ...(await this.checkPartialWriteChains(organizationId, vehicleIds, vehicleById)),
      );
    }

    return this.buildReport({
      findings,
      vehiclesScanned,
      organizationId: options.organizationId ?? null,
      vehicleId: options.vehicleId ?? null,
      organizationCount: orgIds.length,
      referenceNow,
      sampleLimit,
      includeFindings: options.includeFindings ?? false,
    });
  }

  private async resolveOrganizationIds(organizationId?: string): Promise<string[]> {
    if (organizationId) return [organizationId];
    const rows = await this.prisma.organization.findMany({ select: { id: true } });
    return rows.map((r) => r.id);
  }

  private async loadVehicles(
    organizationId: string,
    vehicleId?: string,
  ): Promise<VehicleScopeRow[]> {
    const rows = await this.prisma.vehicle.findMany({
      where: {
        organizationId,
        ...(vehicleId ? { id: vehicleId } : {}),
      },
      select: {
        id: true,
        organizationId: true,
        fuelType: true,
        hvBatteryCapacityKwh: true,
        batteryMeasurementSessions: {
          select: { driveProfile: true },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
        latestState: {
          select: { evSoc: true },
        },
      },
    });

    return rows.map((row) => {
      const sessionProfile = row.batteryMeasurementSessions[0]?.driveProfile ?? null;
      const isLikelyBev =
        sessionProfile === BatteryDriveProfile.BEV ||
        row.hvBatteryCapacityKwh != null ||
        row.latestState?.evSoc != null ||
        /electric|bev|ev/i.test(row.fuelType ?? '');

      return {
        id: row.id,
        organizationId: row.organizationId,
        driveProfile: sessionProfile,
        isLikelyBev,
      };
    });
  }

  private push(
    bucket: BatteryDiagnosticFinding[],
    checkId: BatteryDiagnosticCheckId,
    organizationId: string,
    vehicleId: string,
    message: string,
    details?: BatteryDiagnosticFinding['details'],
  ): void {
    const meta = BATTERY_DIAGNOSTIC_CHECK_META[checkId];
    bucket.push({
      checkId,
      category: meta.category,
      severity: meta.severity,
      organizationId,
      vehicleId,
      message,
      details,
    });
  }

  private vehicleIdsFilter(vehicleIds: string[]): { in: string[] } {
    return { in: vehicleIds };
  }

  private async checkRestVoltageAboveWake(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: this.vehicleIdsFilter(vehicleIds),
        type: { in: [...REST_TARGET_TYPES] },
        quality: { in: [...NON_CONTAMINATED_REST_QUALITIES] },
        numericValue: { gte: DEFAULT_WAKE_VOLTAGE_THRESHOLD_V },
      },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        numericValue: true,
        quality: true,
        observedAt: true,
      },
      take: 500,
    });

    for (const row of rows) {
      this.push(
        findings,
        'rest_voltage_above_wake_threshold',
        organizationId,
        row.vehicleId,
        `REST ${row.type} voltage ${row.numericValue}V >= wake threshold ${DEFAULT_WAKE_VOLTAGE_THRESHOLD_V}V with quality ${row.quality}`,
        {
          measurementId: row.id,
          type: row.type,
          numericValue: row.numericValue,
          quality: row.quality,
          observedAt: row.observedAt.toISOString(),
        },
      );
    }
    return findings;
  }

  private async checkRestChargingContext(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: this.vehicleIdsFilter(vehicleIds),
        type: { in: [...REST_TARGET_TYPES] },
        quality: { in: [...NON_CONTAMINATED_REST_QUALITIES] },
      },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        quality: true,
        context: true,
        provenance: true,
      },
      take: 500,
    });

    for (const row of rows) {
      const ctx = (row.context ?? {}) as Record<string, unknown>;
      const prov = (row.provenance ?? {}) as Record<string, unknown>;
      const isLvCharging = ctx.isLvCharging === true || prov.isLvCharging === true;
      const isHvCharging = ctx.isHvCharging === true || prov.isHvCharging === true;
      if (!isLvCharging && !isHvCharging) continue;

      this.push(
        findings,
        'rest_voltage_above_charging_context',
        organizationId,
        row.vehicleId,
        `REST ${row.type} marked ${row.quality} while charging context present`,
        {
          measurementId: row.id,
          isLvCharging,
          isHvCharging,
        },
      );
    }
    return findings;
  }

  private async checkRest60m6hSameTimestamp(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        type: { in: [BatteryMeasurementType.REST_60M, BatteryMeasurementType.REST_6H] },
      },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        observedAt: true,
      },
      take: 5000,
    });

    const buckets = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.vehicleId}:${row.observedAt.toISOString()}`;
      const bucket = buckets.get(key) ?? [];
      bucket.push(row);
      buckets.set(key, bucket);
    }

    for (const [, group] of buckets) {
      const types = new Set(group.map((g) => g.type));
      if (types.size < 2) continue;
      const sample = group[0];
      this.push(
        findings,
        'rest_60m_6h_same_timestamp',
        organizationId,
        sample.vehicleId,
        `REST_60M and REST_6H share observedAt ${sample.observedAt.toISOString()}`,
        {
          observedAt: sample.observedAt.toISOString(),
          measurementIds: group.map((g) => g.id).join(','),
        },
      );
    }
    return findings;
  }

  private async checkRestAfterTripStart(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const measurements = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        type: { in: [...REST_TARGET_TYPES] },
      },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        observedAt: true,
        sessionId: true,
      },
      take: 1000,
    });

    for (const measurement of measurements) {
      if (!measurement.sessionId) continue;
      const session = await this.prisma.batteryMeasurementSession.findUnique({
        where: { id: measurement.sessionId },
        select: { startedAt: true, tripId: true },
      });
      if (!session) continue;

      const anchor = session.startedAt;
      const tripAfter = await this.prisma.vehicleTrip.findFirst({
        where: {
          vehicleId: measurement.vehicleId,
          startTime: {
            gt: anchor,
            lt: measurement.observedAt,
          },
        },
        select: { id: true, startTime: true },
      });

      if (!tripAfter) continue;

      this.push(
        findings,
        'rest_after_trip_start',
        organizationId,
        measurement.vehicleId,
        `${measurement.type} at ${measurement.observedAt.toISOString()} after trip ${tripAfter.id} started ${tripAfter.startTime.toISOString()}`,
        {
          measurementId: measurement.id,
          sessionId: measurement.sessionId,
          tripId: tripAfter.id,
        },
      );
    }
    return findings;
  }

  private async checkCrankInsufficientCoverage(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];

    const measurements = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        OR: [
          { type: BatteryMeasurementType.START_DIP_PROXY },
          { quality: BatteryMeasurementQuality.INSUFFICIENT_COVERAGE },
        ],
      },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        quality: true,
        sessionId: true,
      },
      take: 500,
    });

    for (const row of measurements) {
      const isStartProxy = row.type === BatteryMeasurementType.START_DIP_PROXY;
      const isInsufficient =
        row.quality === BatteryMeasurementQuality.INSUFFICIENT_COVERAGE;
      if (!isStartProxy && !isInsufficient) continue;
      if (isStartProxy && !isInsufficient) continue;

      this.push(
        findings,
        'crank_insufficient_coverage',
        organizationId,
        row.vehicleId,
        `Crank/start measurement ${row.id} has insufficient coverage (${row.type})`,
        {
          measurementId: row.id,
          sessionId: row.sessionId,
          quality: row.quality,
        },
      );
    }

    const sessions = await this.prisma.batteryMeasurementSession.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        type: { in: [...ICE_START_SESSION_TYPES] },
        status: BatteryMeasurementSessionStatus.COMPLETED,
        measurements: { none: {} },
      },
      select: { id: true, vehicleId: true, type: true },
      take: 200,
    });

    for (const session of sessions) {
      this.push(
        findings,
        'crank_insufficient_coverage',
        organizationId,
        session.vehicleId,
        `Completed ${session.type} session ${session.id} has zero measurements`,
        { sessionId: session.id },
      );
    }

    return findings;
  }

  private async checkBevWithIceCrank(
    organizationId: string,
    vehicles: VehicleScopeRow[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const vehicleIds = vehicles.map((v) => v.id);

    const features = await this.prisma.batteryFeatures.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        OR: [{ crankAt: { not: null } }, { crankTripId: { not: null } }],
      },
      select: { vehicleId: true, crankAt: true, crankTripId: true },
    });

    for (const feature of features) {
      const vehicle = vehicles.find((v) => v.id === feature.vehicleId);
      if (!vehicle?.isLikelyBev) continue;

      this.push(
        findings,
        'bev_with_ice_crank',
        organizationId,
        feature.vehicleId,
        `BEV vehicle has legacy crank features (crankAt=${feature.crankAt?.toISOString() ?? 'null'})`,
        { crankTripId: feature.crankTripId },
      );
    }

    const sessions = await this.prisma.batteryMeasurementSession.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        type: { in: [...ICE_START_SESSION_TYPES] },
        driveProfile: BatteryDriveProfile.BEV,
      },
      select: { id: true, vehicleId: true, type: true },
      take: 200,
    });

    for (const session of sessions) {
      this.push(
        findings,
        'bev_with_ice_crank',
        organizationId,
        session.vehicleId,
        `BEV vehicle has ICE start session ${session.type} (${session.id})`,
        { sessionId: session.id },
      );
    }

    return findings;
  }

  private async checkLvWrongSohEvidence(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.batteryEvidence.findMany({
      where: {
        vehicle: { organizationId, id: { in: vehicleIds } },
        scope: 'LV',
        valueType: 'SOH_PERCENT',
      },
      select: {
        id: true,
        vehicleId: true,
        sourceType: true,
        numericValue: true,
        observedAt: true,
      },
      take: 500,
    });

    for (const row of rows) {
      this.push(
        findings,
        'lv_wrong_soh_percent_evidence',
        organizationId,
        row.vehicleId,
        `LV evidence ${row.id} uses SOH_PERCENT (${row.numericValue}%) from ${row.sourceType}`,
        {
          evidenceId: row.id,
          observedAt: row.observedAt.toISOString(),
        },
      );
    }
    return findings;
  }

  private async checkIncompatibleMeasurementCycles(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        quality: { in: [...INCOMPATIBLE_CYCLE_QUALITIES] },
      },
      select: {
        id: true,
        vehicleId: true,
        type: true,
        quality: true,
        observedAt: true,
      },
      take: 500,
    });

    for (const row of rows) {
      this.push(
        findings,
        'incompatible_measurement_cycle',
        organizationId,
        row.vehicleId,
        `Measurement ${row.id} (${row.type}) has incompatible cycle quality ${row.quality}`,
        {
          measurementId: row.id,
          observedAt: row.observedAt.toISOString(),
        },
      );
    }
    return findings;
  }

  private async checkStablePublicationWithoutEvidence(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];

    const publications = await this.prisma.batteryPublication.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        status: SohPublicationState.STABLE,
      },
      include: {
        assessment: {
          select: {
            id: true,
            evidenceStrength: true,
            maturity: true,
            inputSummary: true,
          },
        },
      },
      take: 500,
    });

    for (const pub of publications) {
      const validMeasurements = await this.prisma.batteryMeasurement.count({
        where: {
          vehicleId: pub.vehicleId,
          scope: pub.scope,
          quality: { in: [BatteryMeasurementQuality.VALID, BatteryMeasurementQuality.VALID_PROXY] },
        },
      });

      const summary = (pub.assessment?.inputSummary ?? {}) as Record<string, unknown>;
      const selectedCount = Array.isArray(summary.selectedMeasurementIds)
        ? summary.selectedMeasurementIds.length
        : 0;
      const cycleCount = Array.isArray(summary.evidenceCycles)
        ? summary.evidenceCycles.length
        : 0;

      const hasBelastbareEvidence =
        validMeasurements >= LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT &&
        selectedCount >= LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT &&
        cycleCount >= LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE &&
        pub.assessment != null;

      if (hasBelastbareEvidence) continue;

      this.push(
        findings,
        'stable_publication_without_evidence',
        organizationId,
        pub.vehicleId,
        `STABLE publication ${pub.id} lacks belastbare evidence (validMeasurements=${validMeasurements}, selected=${selectedCount}, cycles=${cycleCount})`,
        {
          publicationId: pub.id,
          assessmentId: pub.assessmentId,
          validMeasurementCount: validMeasurements,
          selectedMeasurementCount: selectedCount,
          compatibleCycleCount: cycleCount,
        },
      );
    }

    const features = await this.prisma.batteryFeatures.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        publicationState: SohPublicationState.STABLE,
      },
      select: {
        vehicleId: true,
        qualifiedEventCount: true,
        restObservationCount: true,
        publishedSohPct: true,
      },
    });

    for (const feature of features) {
      if (
        feature.qualifiedEventCount >= LV_PUBLICATION_MIN_VALID_EVIDENCE_COUNT &&
        feature.restObservationCount >= LV_PUBLICATION_MIN_COMPATIBLE_CYCLES_STABLE
      ) {
        continue;
      }

      const alreadyReported = findings.some(
        (f) =>
          f.checkId === 'stable_publication_without_evidence' &&
          f.vehicleId === feature.vehicleId,
      );
      if (alreadyReported) continue;

      this.push(
        findings,
        'stable_publication_without_evidence',
        organizationId,
        feature.vehicleId,
        `battery_features STABLE with insufficient counters (qualified=${feature.qualifiedEventCount}, rest=${feature.restObservationCount})`,
        {
          publishedSohPct: feature.publishedSohPct,
          qualifiedEventCount: feature.qualifiedEventCount,
          restObservationCount: feature.restObservationCount,
        },
      );
    }

    return findings;
  }

  private async checkHvPersistenceDuplicates(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];

    const idempotencyDupes = await this.prisma.$queryRaw<
      Array<{ vehicle_id: string; idempotency_key: string; cnt: bigint }>
    >`
      SELECT vehicle_id, idempotency_key, COUNT(*)::bigint AS cnt
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ANY(${vehicleIds}::uuid[])
        AND idempotency_key IS NOT NULL
      GROUP BY vehicle_id, idempotency_key
      HAVING COUNT(*) > 1
      LIMIT 200
    `;

    for (const row of idempotencyDupes) {
      this.push(
        findings,
        'hv_persistence_duplicate',
        organizationId,
        row.vehicle_id,
        `Duplicate HV snapshots for idempotencyKey ${row.idempotency_key} (count=${row.cnt})`,
        { idempotencyKey: row.idempotency_key, count: Number(row.cnt) },
      );
    }

    const recordedAtDupes = await this.prisma.$queryRaw<
      Array<{ vehicle_id: string; recorded_at: Date; cnt: bigint }>
    >`
      SELECT vehicle_id, recorded_at, COUNT(*)::bigint AS cnt
      FROM hv_battery_health_snapshots
      WHERE vehicle_id = ANY(${vehicleIds}::uuid[])
      GROUP BY vehicle_id, recorded_at
      HAVING COUNT(*) > 1
      LIMIT 200
    `;

    for (const row of recordedAtDupes) {
      this.push(
        findings,
        'hv_persistence_duplicate',
        organizationId,
        row.vehicle_id,
        `Duplicate HV snapshots at recordedAt ${row.recorded_at.toISOString()} (count=${row.cnt})`,
        { recordedAt: row.recorded_at.toISOString(), count: Number(row.cnt) },
      );
    }

    return findings;
  }

  private async checkLegacyPairwiseCapacity(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.hvCapacityObservation.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        method: 'LEGACY_PAIRWISE_POLL',
      },
      select: {
        id: true,
        vehicleId: true,
        estimatedCapacityKwh: true,
        observedAt: true,
      },
      take: 500,
    });

    for (const row of rows) {
      this.push(
        findings,
        'legacy_pairwise_capacity',
        organizationId,
        row.vehicleId,
        `Legacy pairwise capacity observation ${row.id} (${row.estimatedCapacityKwh ?? 'null'} kWh)`,
        {
          observationId: row.id,
          observedAt: row.observedAt.toISOString(),
        },
      );
    }
    return findings;
  }

  private async checkUnverifiedReferenceCapacity(
    organizationId: string,
    vehicleIds: string[],
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];
    const rows = await this.prisma.vehicleBatteryReferenceCapacity.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        isActive: true,
        verificationStatus: { in: UNVERIFIED_REFERENCE_STATUSES },
      },
      select: {
        id: true,
        vehicleId: true,
        verificationStatus: true,
        capacityKwh: true,
        source: true,
      },
    });

    for (const row of rows) {
      const usedByObservation = await this.prisma.hvCapacityObservation.count({
        where: {
          vehicleId: row.vehicleId,
          referenceCapacityKwh: row.capacityKwh,
        },
      });

      this.push(
        findings,
        'unverified_reference_capacity',
        organizationId,
        row.vehicleId,
        `Active reference capacity ${row.id} is ${row.verificationStatus} (${row.capacityKwh} kWh, usedByObservations=${usedByObservation})`,
        {
          referenceCapacityId: row.id,
          verificationStatus: row.verificationStatus,
          source: row.source,
          observationLinkCount: usedByObservation,
        },
      );
    }
    return findings;
  }

  private async checkPartialWriteChains(
    organizationId: string,
    vehicleIds: string[],
    _vehicleById: Map<string, VehicleScopeRow>,
  ): Promise<BatteryDiagnosticFinding[]> {
    const findings: BatteryDiagnosticFinding[] = [];

    const emptySessions = await this.prisma.batteryMeasurementSession.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        status: {
          in: [
            BatteryMeasurementSessionStatus.COMPLETED,
            BatteryMeasurementSessionStatus.MISSED,
          ],
        },
        measurements: { none: {} },
      },
      select: { id: true, vehicleId: true, type: true, status: true },
      take: 200,
    });

    for (const session of emptySessions) {
      this.push(
        findings,
        'partial_write_chain',
        organizationId,
        session.vehicleId,
        `Terminal session ${session.id} (${session.type}/${session.status}) has no measurements`,
        { sessionId: session.id },
      );
    }

    const orphanMeasurements = await this.prisma.batteryMeasurement.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        sessionId: { not: null },
      },
      select: { id: true, vehicleId: true, sessionId: true },
      take: 1000,
    });

    const sessionIds = [
      ...new Set(
        orphanMeasurements
          .map((m) => m.sessionId)
          .filter((id): id is string => id != null),
      ),
    ];
    const existingSessions = new Set(
      (
        await this.prisma.batteryMeasurementSession.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true },
        })
      ).map((s) => s.id),
    );

    for (const measurement of orphanMeasurements) {
      if (!measurement.sessionId || existingSessions.has(measurement.sessionId)) continue;
      this.push(
        findings,
        'partial_write_chain',
        organizationId,
        measurement.vehicleId,
        `Measurement ${measurement.id} references missing session ${measurement.sessionId}`,
        { measurementId: measurement.id, sessionId: measurement.sessionId },
      );
    }

    const pubs = await this.prisma.batteryPublication.findMany({
      where: {
        organizationId,
        vehicleId: { in: vehicleIds },
        assessmentId: { not: null },
      },
      select: { id: true, vehicleId: true, assessmentId: true },
      take: 500,
    });

    const assessmentIds = pubs
      .map((p) => p.assessmentId)
      .filter((id): id is string => id != null);
    const existingAssessments = new Set(
      (
        await this.prisma.batteryAssessment.findMany({
          where: { id: { in: assessmentIds } },
          select: { id: true },
        })
      ).map((a) => a.id),
    );

    for (const pub of pubs) {
      if (!pub.assessmentId || existingAssessments.has(pub.assessmentId)) continue;
      this.push(
        findings,
        'partial_write_chain',
        organizationId,
        pub.vehicleId,
        `Publication ${pub.id} references missing assessment ${pub.assessmentId}`,
        { publicationId: pub.id, assessmentId: pub.assessmentId },
      );
    }

    const evidenceRows = await this.prisma.batteryEvidence.findMany({
      where: {
        vehicleId: { in: vehicleIds },
        measurementId: { not: null },
      },
      select: { id: true, vehicleId: true, measurementId: true },
      take: 500,
    });

    const measurementIds = evidenceRows
      .map((e) => e.measurementId)
      .filter((id): id is string => id != null);
    const existingMeasurements = new Set(
      (
        await this.prisma.batteryMeasurement.findMany({
          where: { id: { in: measurementIds } },
          select: { id: true },
        })
      ).map((m) => m.id),
    );

    for (const evidence of evidenceRows) {
      if (!evidence.measurementId || existingMeasurements.has(evidence.measurementId)) {
        continue;
      }
      this.push(
        findings,
        'partial_write_chain',
        organizationId,
        evidence.vehicleId,
        `Evidence ${evidence.id} references missing measurement ${evidence.measurementId}`,
        { evidenceId: evidence.id, measurementId: evidence.measurementId },
      );
    }

    return findings;
  }

  private buildReport(input: {
    findings: BatteryDiagnosticFinding[];
    vehiclesScanned: number;
    organizationId: string | null;
    vehicleId: string | null;
    organizationCount: number;
    referenceNow: Date;
    sampleLimit: number;
    includeFindings: boolean;
  }): BatteryDiagnosticReport {
    const byCheck: Partial<Record<BatteryDiagnosticCheckId, number>> = {};
    const byCategory = this.emptyCategoryCounts();
    let errors = 0;
    let warnings = 0;
    let infos = 0;

    for (const finding of input.findings) {
      byCheck[finding.checkId] = (byCheck[finding.checkId] ?? 0) + 1;
      byCategory[finding.category] += 1;
      if (finding.severity === 'error') errors += 1;
      else if (finding.severity === 'warning') warnings += 1;
      else infos += 1;
    }

    const checkIds = Object.keys(BATTERY_DIAGNOSTIC_CHECK_META) as BatteryDiagnosticCheckId[];
    const checks = checkIds
      .map((checkId) => {
        const related = input.findings.filter((f) => f.checkId === checkId);
        if (related.length === 0) return null;
        const meta = BATTERY_DIAGNOSTIC_CHECK_META[checkId];
        return {
          checkId,
          category: meta.category,
          severity: meta.severity,
          label: meta.label,
          count: related.length,
          sampleVehicleIds: related
            .slice(0, input.sampleLimit)
            .map((f) => maskVehicleId(f.vehicleId)),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null)
      .sort((a, b) => b.count - a.count);

    return {
      mode: 'diagnostic',
      scriptVersion: BATTERY_DATA_DIAGNOSTIC_SCRIPT_VERSION,
      dryRun: true,
      readOnly: true,
      generatedAt: new Date().toISOString(),
      referenceNow: input.referenceNow.toISOString(),
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      organizationCount: input.organizationCount,
      vehiclesScanned: input.vehiclesScanned,
      summary: {
        totalFindings: input.findings.length,
        errors,
        warnings,
        infos,
        byCategory,
        byCheck,
      },
      checks,
      findings: input.includeFindings
        ? input.findings.slice(0, input.sampleLimit * Math.max(checks.length, 1)).map((f) => ({
            ...f,
            vehicleId: maskVehicleId(f.vehicleId),
          }))
        : undefined,
    };
  }

  private emptyCategoryCounts(): Record<BatteryDiagnosticCategory, number> {
    return {
      rest_quality: 0,
      crank_start: 0,
      evidence: 0,
      publication: 0,
      hv_capacity: 0,
      reference_capacity: 0,
      write_chain: 0,
      legacy: 0,
    };
  }
}
