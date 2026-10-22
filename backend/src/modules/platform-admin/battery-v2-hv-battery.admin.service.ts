import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  isBatteryV2HvCapacityShadowEnabled,
  isBatteryV2HvRechargeSessionEnabled,
  isBatteryV2HvSohPublicationEnabled,
} from '@config/battery-health-v2.config';
import { resolveDriveProfile } from '../vehicle-intelligence/drive-profile/drive-profile-resolver';
import { isHvMeasurementSupported } from '../vehicle-intelligence/drive-profile/drive-profile-resolver';
import { HvMeasurementQualityService } from '../vehicle-intelligence/battery-health/hv-measurement-quality/hv-measurement-quality.service';
import { BatteryAssessmentRepository } from '../vehicle-intelligence/battery-health/battery-assessment.repository';
import { mapBatteryAssessmentToCrossSessionEvidence } from '../vehicle-intelligence/battery-health/hv-measurement-quality/hv-measurement-quality.cross-session';
import { RECHARGE_SEGMENTS_SIGNAL_KEY } from '../vehicle-intelligence/battery-health/capability-preflight/battery-capability-signals.registry';
import type { HvChargeSessionMetadata } from '../vehicle-intelligence/battery-health/hv-charge-session/hv-charge-session.types';
import { HV_M2_CAPACITY_METHOD } from '../vehicle-intelligence/battery-health/hv-capacity-shadow/hv-capacity-m2.types';
import {
  clusterHvAdminPhysicalChargeEpisodes,
  type HvAdminPhysicalEpisodeSessionRow,
} from './hv-battery-admin-physical-episode.policy';
import {
  HV_BATTERY_ADMIN_CONTRACT_VERSION,
  type HvBatteryAdminAvailability,
  type HvBatteryAdminChargeEpisodeDetailV1,
  type HvBatteryAdminChargeEpisodeListItemV1,
  type HvBatteryAdminChargeEpisodeListV1,
  type HvBatteryAdminOverviewV1,
  type HvBatteryAdminSohPresentation,
  type HvBatteryAdminTechnicalDetailsV1,
  type HvBatteryAdminVehicleContextV1,
} from './battery-v2-hv-battery.admin.types';

const MAX_EPISODE_SCAN = 500;
const SNAPSHOT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const SOH_ADMIN_DISCLAIMER =
  'Internal shadow/gated estimates only — not customer-facing SOH publication. No synthetic or offline replay values.';

@Injectable()
export class BatteryV2HvBatteryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementQuality: HvMeasurementQualityService,
    private readonly assessments: BatteryAssessmentRepository,
  ) {}

  async getVehicleContext(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<HvBatteryAdminVehicleContextV1> {
    const vehicle = await this.assertVehicle(input.organizationId, input.vehicleId);
    const drive = resolveDriveProfile({
      master: { fuelType: vehicle.fuelType },
      provider: null,
      canonicalSpec: null,
      telemetry: null,
    });
    const capability = await this.prisma.vehicleBatteryCapability.findUnique({
      where: {
        vehicleId_signalKey: {
          vehicleId: input.vehicleId,
          signalKey: RECHARGE_SEGMENTS_SIGNAL_KEY,
        },
      },
      select: { id: true },
    });

    return {
      contractVersion: HV_BATTERY_ADMIN_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      hvSupported: isHvMeasurementSupported(drive.profile),
      driveProfile: drive.profile,
      rechargeCapabilitySignalPresent: capability != null,
    };
  }

  async getOverview(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<HvBatteryAdminOverviewV1> {
    await this.assertHvVehicle(input.organizationId, input.vehicleId);
    const now = new Date();
    const [rows, quality, crossSessionRow, sohRow, snapshotAgg, latestSnapshot] =
      await Promise.all([
        this.loadSessionRows(input.organizationId, input.vehicleId),
        this.measurementQuality.getVehicleMeasurementQuality(
          input.organizationId,
          input.vehicleId,
        ),
        this.assessments.findLatestHvCapacityShadow(input),
        this.assessments.findLatestHvSohGateAssessment(input),
        this.prisma.hvBatteryHealthSnapshot.count({
          where: {
            vehicleId: input.vehicleId,
            recordedAt: { gte: new Date(now.getTime() - SNAPSHOT_WINDOW_MS) },
          },
        }),
        this.prisma.hvBatteryHealthSnapshot.findFirst({
          where: { vehicleId: input.vehicleId },
          orderBy: { recordedAt: 'desc' },
          select: {
            recordedAt: true,
            socPercent: true,
            energyUsedKwh: true,
          },
        }),
      ]);

    const clusters = clusterHvAdminPhysicalChargeEpisodes(rows, now);
    const completed = clusters.filter((c) => !c.isOngoing && c.endAt);
    const last = completed[0] ?? null;
    const lastCanonical = last
      ? rows.find((row) => row.id === last.canonicalSessionId)
      : null;

    const crossSession = mapBatteryAssessmentToCrossSessionEvidence(crossSessionRow);
    const socAvailability = resolveSocAvailability(rows);
    const energyAvailability = resolveEnergyAvailability(rows);

    const sohPresentation = resolveSohPresentation(crossSession, sohRow);
    const internalSoh = resolveInternalSohPercent(sohRow, sohPresentation);

    return {
      contractVersion: HV_BATTERY_ADMIN_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      evaluatedAt: now.toISOString(),
      physicalChargeEpisodeCount: clusters.length,
      rawProviderSegmentCount: rows.length,
      lastCompletedCharge: last && lastCanonical
        ? {
            episodeId: last.episodeId,
            endedAt: last.endAt!.toISOString(),
            startSocPercent: lastCanonical.startSocPercent,
            endSocPercent: lastCanonical.endSocPercent,
            energyAddedKwh: lastCanonical.energyAddedKwh,
          }
        : null,
      socDataAvailability: socAvailability,
      energyDataAvailability: energyAvailability,
      measurementQuality: {
        vehicleQualityLevel: quality.vehicleQualityLevel,
        qualityScore: quality.qualityScore,
        capacityConfidence: quality.capacityConfidence,
        referenceConfidence: quality.referenceConfidence,
        sohPublicationReadiness: quality.sohPublicationReadiness,
      },
      capacityEvidence: {
        crossSessionAvailability: crossSession
          ? crossSession.shadowGatePassed
            ? 'AVAILABLE'
            : 'NOT_VALIDATED'
          : 'NOT_CALCULATED',
        shadowGatePassed: crossSession?.shadowGatePassed ?? false,
        estimatedUsableCapacityKwh: crossSession?.estimatedUsableCapacityKwh ?? null,
        computedAt: crossSession?.computedAt ?? null,
      },
      sohEvidence: {
        presentation: sohPresentation,
        availability: internalSoh != null ? 'AVAILABLE' : sohRow ? 'NOT_VALIDATED' : 'NOT_CALCULATED',
        internalEstimatedSohPercent: internalSoh,
        gateReasonCodes: extractSohGateReasons(sohRow),
        disclaimer: SOH_ADMIN_DISCLAIMER,
      },
      snapshotCoverage: {
        snapshotsLast30Days: snapshotAgg,
        latestRecordedAt: latestSnapshot?.recordedAt.toISOString() ?? null,
        latestSocPercent: latestSnapshot?.socPercent ?? null,
        latestEnergyKwh: latestSnapshot?.energyUsedKwh ?? null,
      },
    };
  }

  async listChargeEpisodes(input: {
    organizationId: string;
    vehicleId: string;
    page?: number;
    limit?: number;
  }): Promise<HvBatteryAdminChargeEpisodeListV1> {
    await this.assertHvVehicle(input.organizationId, input.vehicleId);
    const page = Math.max(1, input.page ?? 1);
    const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
    const now = new Date();
    const rows = await this.loadSessionRows(input.organizationId, input.vehicleId);
    const clusters = clusterHvAdminPhysicalChargeEpisodes(rows, now);
    const quality = await this.measurementQuality.getVehicleMeasurementQuality(
      input.organizationId,
      input.vehicleId,
    );
    const qualityBySession = new Map(
      quality.sessions.map((session) => [session.sessionId, session]),
    );

    const total = clusters.length;
    const slice = clusters.slice((page - 1) * limit, page * limit);
    const episodes: HvBatteryAdminChargeEpisodeListItemV1[] = slice.map((cluster) => {
      const canonical = rows.find((row) => row.id === cluster.canonicalSessionId)!;
      const meta = canonical.metadata;
      const mq = qualityBySession.get(canonical.id);
      const durationSeconds =
        cluster.endAt != null
          ? Math.max(0, Math.round((cluster.endAt.getTime() - cluster.startAt.getTime()) / 1000))
          : null;
      return {
        episodeId: cluster.episodeId,
        canonicalSessionId: cluster.canonicalSessionId,
        startAt: cluster.startAt.toISOString(),
        endAt: cluster.endAt?.toISOString() ?? null,
        durationSeconds,
        startSocPercent: canonical.startSocPercent,
        endSocPercent: canonical.endSocPercent,
        deltaSocPercent: canonical.deltaSocPercent,
        energyAddedKwh: canonical.energyAddedKwh,
        providerSegmentCount: cluster.providerSegmentCount,
        primarySource: canonical.source,
        sessionStatus: cluster.isOngoing ? 'ONGOING' : 'COMPLETED',
        qualityStatus: meta?.qualityStatus ?? null,
        measurementQuality: mq?.measurementQuality ?? canonical.quality,
      };
    });

    return {
      contractVersion: HV_BATTERY_ADMIN_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      page,
      limit,
      totalPhysicalEpisodes: total,
      totalRawSegments: rows.length,
      episodes,
    };
  }

  async getChargeEpisodeDetail(input: {
    organizationId: string;
    vehicleId: string;
    episodeId: string;
  }): Promise<HvBatteryAdminChargeEpisodeDetailV1> {
    await this.assertHvVehicle(input.organizationId, input.vehicleId);
    const now = new Date();
    const rows = await this.loadSessionRows(input.organizationId, input.vehicleId);
    const clusters = clusterHvAdminPhysicalChargeEpisodes(rows, now);
    const cluster = clusters.find(
      (c) => c.episodeId === input.episodeId || c.sessionIds.includes(input.episodeId),
    );
    if (!cluster) {
      throw new NotFoundException('HV charge episode not found for vehicle');
    }

    const list = await this.listChargeEpisodes({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      page: 1,
      limit: MAX_EPISODE_SCAN,
    });
    const summary = list.episodes.find((ep) => ep.episodeId === cluster.episodeId);
    if (!summary) {
      throw new NotFoundException('HV charge episode summary unavailable');
    }

    const segments = rows
      .filter((row) => cluster.sessionIds.includes(row.id))
      .map((row) => mapProviderSegment(row));

    const canonical = rows.find((row) => row.id === cluster.canonicalSessionId)!;
    const meta = canonical.metadata;
    const m2Summary = meta?.m2CapacitySummary ?? null;
    const m3Validation = meta?.m3Validation ?? null;

    const observations = await this.prisma.hvCapacityObservation.count({
      where: {
        chargeSessionId: canonical.id,
        method: HV_M2_CAPACITY_METHOD,
      },
    });

    const quality = await this.measurementQuality.getVehicleMeasurementQuality(
      input.organizationId,
      input.vehicleId,
    );
    const mq = quality.sessions.find((s) => s.sessionId === canonical.id);

    return {
      contractVersion: HV_BATTERY_ADMIN_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      episodeId: cluster.episodeId,
      summary,
      providerSegments: segments,
      m2: {
        availability: m2Summary ? 'AVAILABLE' : observations > 0 ? 'NOT_VALIDATED' : 'NOT_CALCULATED',
        summary: m2Summary as Record<string, unknown> | null,
        observationCount: observations,
      },
      m3: {
        availability: m3Validation ? 'AVAILABLE' : 'NOT_CALCULATED',
        validation: m3Validation as Record<string, unknown> | null,
      },
      measurementQuality: mq
        ? {
            qualityLevel: mq.qualityLevel,
            qualityScore: mq.qualityScore,
            exclusionReasons: mq.exclusionReasons,
            qualityReasonCodes: mq.qualityReasonCodes,
          }
        : null,
      technicalNotes: [
        'M2/M3 artifacts are shadow-pipeline outputs; absence means not calculated yet, not missing telemetry.',
        'Provider segments listed below; physical episode count uses independence clustering.',
      ],
    };
  }

  async getTechnicalDetails(input: {
    organizationId: string;
    vehicleId: string;
  }): Promise<HvBatteryAdminTechnicalDetailsV1> {
    await this.assertHvVehicle(input.organizationId, input.vehicleId);
    const now = new Date();
    const [quality, crossSessionRow, sohRow, reference, snapshotAgg, latestSnapshot] =
      await Promise.all([
        this.measurementQuality.getVehicleMeasurementQuality(
          input.organizationId,
          input.vehicleId,
        ),
        this.assessments.findLatestHvCapacityShadow(input),
        this.assessments.findLatestHvSohGateAssessment(input),
        this.prisma.vehicleBatteryReferenceCapacity.findFirst({
          where: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            isActive: true,
          },
          orderBy: { effectiveFrom: 'desc' },
        }),
        this.prisma.hvBatteryHealthSnapshot.count({
          where: {
            vehicleId: input.vehicleId,
            recordedAt: { gte: new Date(now.getTime() - SNAPSHOT_WINDOW_MS) },
          },
        }),
        this.prisma.hvBatteryHealthSnapshot.findFirst({
          where: { vehicleId: input.vehicleId },
          orderBy: { recordedAt: 'desc' },
          select: {
            recordedAt: true,
            socPercent: true,
            energyUsedKwh: true,
          },
        }),
      ]);

    const crossSession = mapBatteryAssessmentToCrossSessionEvidence(crossSessionRow);
    const sohPresentation = resolveSohPresentation(crossSession, sohRow);
    const internalSoh = resolveInternalSohPercent(sohRow, sohPresentation);
    const sohSummary =
      sohRow?.inputSummary && typeof sohRow.inputSummary === 'object'
        ? (sohRow.inputSummary as Record<string, unknown>)
        : null;

    return {
      contractVersion: HV_BATTERY_ADMIN_CONTRACT_VERSION,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      evaluatedAt: now.toISOString(),
      measurementQuality: quality as unknown as Record<string, unknown>,
      crossSessionAssessment: {
        availability: crossSession
          ? crossSession.shadowGatePassed
            ? 'AVAILABLE'
            : 'NOT_VALIDATED'
          : 'NOT_CALCULATED',
        persisted: crossSessionRow
          ? {
              id: crossSessionRow.id,
              computedAt: crossSessionRow.computedAt.toISOString(),
              scoreValue: crossSessionRow.scoreValue,
              confidence: crossSessionRow.confidence,
              maturity: crossSessionRow.maturity,
              inputSummary: crossSessionRow.inputSummary,
            }
          : null,
      },
      sohAssessment: {
        presentation: sohPresentation,
        availability: internalSoh != null ? 'AVAILABLE' : sohRow ? 'NOT_VALIDATED' : 'NOT_CALCULATED',
        persisted: sohRow
          ? {
              id: sohRow.id,
              computedAt: sohRow.computedAt.toISOString(),
              scoreValue: sohRow.scoreValue,
              maturity: sohRow.maturity,
              inputSummary: sohSummary,
            }
          : null,
        internalEstimatedSohPercent: internalSoh,
        publicationEligible: sohSummary?.publicationEligible === true,
        gateReasonCodes: extractSohGateReasons(sohRow),
        disclaimer: SOH_ADMIN_DISCLAIMER,
      },
      snapshotCoverage: {
        snapshotsLast30Days: snapshotAgg,
        latestRecordedAt: latestSnapshot?.recordedAt.toISOString() ?? null,
        latestSocPercent: latestSnapshot?.socPercent ?? null,
        latestEnergyKwh: latestSnapshot?.energyUsedKwh ?? null,
      },
      referenceCapacity: {
        availability: reference ? 'AVAILABLE' : 'NOT_AVAILABLE',
        capacityKwh: reference?.capacityKwh ?? null,
        capacityType: reference?.capacityType ?? null,
        verificationStatus: reference?.verificationStatus ?? null,
      },
      featureFlags: {
        hvCapacityShadowEnabled: isBatteryV2HvCapacityShadowEnabled(),
        hvSohPublicationEnabled: isBatteryV2HvSohPublicationEnabled(),
        hvRechargeSessionEnabled: isBatteryV2HvRechargeSessionEnabled(),
      },
    };
  }

  private async loadSessionRows(
    organizationId: string,
    vehicleId: string,
  ): Promise<HvAdminPhysicalEpisodeSessionRow[]> {
    const rows = await this.prisma.hvChargeSession.findMany({
      where: { organizationId, vehicleId },
      orderBy: { startAt: 'desc' },
      take: MAX_EPISODE_SCAN,
      select: {
        id: true,
        source: true,
        segmentFingerprint: true,
        startAt: true,
        endAt: true,
        startSocPercent: true,
        endSocPercent: true,
        startEnergyKwh: true,
        endEnergyKwh: true,
        energyAddedKwh: true,
        deltaSocPercent: true,
        isOngoing: true,
        quality: true,
        metadata: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      segmentFingerprint: row.segmentFingerprint,
      startAt: row.startAt,
      endAt: row.endAt,
      startSocPercent: row.startSocPercent,
      endSocPercent: row.endSocPercent,
      startEnergyKwh: row.startEnergyKwh,
      endEnergyKwh: row.endEnergyKwh,
      energyAddedKwh: row.energyAddedKwh,
      deltaSocPercent: row.deltaSocPercent,
      isOngoing: row.isOngoing,
      quality: row.quality,
      metadata: parseMetadata(row.metadata),
    }));
  }

  private async assertVehicle(organizationId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        id: true,
        fuelType: true,
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found for organization');
    }
    return vehicle;
  }

  private async assertHvVehicle(organizationId: string, vehicleId: string) {
    const vehicle = await this.assertVehicle(organizationId, vehicleId);
    const drive = resolveDriveProfile({
      master: { fuelType: vehicle.fuelType },
      provider: null,
      canonicalSpec: null,
      telemetry: null,
    });
    if (!isHvMeasurementSupported(drive.profile)) {
      throw new NotFoundException('Vehicle is not an HV-supported electric powertrain for this view');
    }
    return vehicle;
  }
}

function parseMetadata(raw: unknown): HvChargeSessionMetadata | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as HvChargeSessionMetadata;
}

function mapProviderSegment(row: HvAdminPhysicalEpisodeSessionRow) {
  const meta = row.metadata;
  return {
    sessionId: row.id,
    source: row.source,
    segmentFingerprint: row.segmentFingerprint,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt?.toISOString() ?? null,
    isOngoing: row.isOngoing,
    isSuperseded: Boolean(meta?.supersededBySegmentFingerprint),
    supersededBySegmentFingerprint: meta?.supersededBySegmentFingerprint ?? null,
    qualityStatus: meta?.qualityStatus ?? null,
    measurementQuality: row.quality,
  };
}

function resolveSocAvailability(rows: HvAdminPhysicalEpisodeSessionRow[]): HvBatteryAdminAvailability {
  if (rows.length === 0) return 'NOT_MEASURED';
  const withSoc = rows.some(
    (row) => row.startSocPercent != null || row.endSocPercent != null,
  );
  return withSoc ? 'AVAILABLE' : 'NOT_MEASURED';
}

function resolveEnergyAvailability(
  rows: HvAdminPhysicalEpisodeSessionRow[],
): HvBatteryAdminAvailability {
  if (rows.length === 0) return 'NOT_MEASURED';
  const withEnergy = rows.some(
    (row) =>
      row.startEnergyKwh != null ||
      row.endEnergyKwh != null ||
      row.energyAddedKwh != null,
  );
  return withEnergy ? 'AVAILABLE' : 'NOT_MEASURED';
}

function resolveSohPresentation(
  crossSession: ReturnType<typeof mapBatteryAssessmentToCrossSessionEvidence>,
  sohRow: { id: string } | null,
): HvBatteryAdminSohPresentation {
  if (!isBatteryV2HvSohPublicationEnabled()) {
    if (sohRow) return 'SHADOW_SOH_GATE_INTERNAL';
    if (crossSession) return 'SHADOW_CROSS_SESSION_ONLY';
    return 'PUBLICATION_DISABLED';
  }
  if (sohRow) return 'SHADOW_SOH_GATE_INTERNAL';
  return 'NONE';
}

function resolveInternalSohPercent(
  sohRow: { scoreValue: number | null; inputSummary: unknown } | null,
  presentation: HvBatteryAdminSohPresentation,
): number | null {
  if (!sohRow || presentation === 'PUBLICATION_DISABLED' || presentation === 'NONE') {
    return null;
  }
  const summary =
    sohRow.inputSummary && typeof sohRow.inputSummary === 'object'
      ? (sohRow.inputSummary as Record<string, unknown>)
      : null;
  const availability = summary?.availability;
  if (availability === 'UNAVAILABLE' || availability === 'GATED') {
    return null;
  }
  if (typeof sohRow.scoreValue === 'number' && Number.isFinite(sohRow.scoreValue)) {
    return sohRow.scoreValue;
  }
  return null;
}

function extractSohGateReasons(
  sohRow: { inputSummary: unknown } | null,
): string[] {
  if (!sohRow?.inputSummary || typeof sohRow.inputSummary !== 'object') return [];
  const summary = sohRow.inputSummary as Record<string, unknown>;
  if (!Array.isArray(summary.gateReasonCodes)) return [];
  return summary.gateReasonCodes.filter((c): c is string => typeof c === 'string');
}
