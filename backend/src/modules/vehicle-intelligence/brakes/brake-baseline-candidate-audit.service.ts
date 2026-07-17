import { Injectable } from '@nestjs/common';
import { EnrichmentJobType, ServiceEventType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  auditBrakeBaselineCandidates,
  BRAKE_BASELINE_AUDIT_ID,
  type BrakeBaselineAuditReport,
  type VehicleBrakeBaselineAuditInput,
} from './brake-baseline-candidate-audit';
import {
  buildVehicleBrakeBaselineAuditInput,
  isBrakeRelatedDtcCode,
} from './brake-baseline-candidate-audit.loader';
import { BrakeEnrichmentJobDiagnosticsService } from './brake-enrichment-job-diagnostics.service';

@Injectable()
export class BrakeBaselineCandidateAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrichmentDiagnostics: BrakeEnrichmentJobDiagnosticsService,
  ) {}

  /**
   * Read-only fleet audit for vehicles missing BrakeHealthCurrent or reliable baseline.
   * Does not mutate production data.
   */
  async runAudit(options?: {
    organizationId?: string;
    vehicleId?: string;
    limit?: number;
    mode?: 'fixtures' | 'database';
    auditSalt?: string;
  }): Promise<BrakeBaselineAuditReport> {
    const inputs = await this.loadCandidates(options);
    return auditBrakeBaselineCandidates(inputs, {
      auditId: BRAKE_BASELINE_AUDIT_ID,
      mode: options?.mode ?? 'database',
      auditSalt: options?.auditSalt ?? BRAKE_BASELINE_AUDIT_ID,
    });
  }

  private async loadCandidates(options?: {
    organizationId?: string;
    vehicleId?: string;
    limit?: number;
    auditSalt?: string;
  }): Promise<VehicleBrakeBaselineAuditInput[]> {
    const auditSalt = options?.auditSalt ?? BRAKE_BASELINE_AUDIT_ID;
    const vehicles = await this.prisma.vehicle.findMany({
      where: {
        ...(options?.vehicleId ? { id: options.vehicleId } : {}),
        ...(options?.organizationId ? { organizationId: options.organizationId } : {}),
        OR: [
          { brakeHealthCurrent: null },
          { brakeHealthCurrent: { isInitialized: false } },
          { brakeHealthCurrent: { stateClass: 'NO_BASELINE' } },
          { brakeHealthCurrent: { anchorValidationStatus: 'invalid' } },
          { brakeHealthCurrent: { anchorValidationStatus: { contains: 'spec_fallback', mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        organizationId: true,
        createdAt: true,
        mileageKm: true,
        brakeHealthCurrent: true,
        brakeSpecs: { orderBy: { createdAt: 'desc' }, take: 1 },
        brakeEvidence: {
          orderBy: { measuredAt: 'desc' },
          take: 50,
        },
        serviceEvents: {
          where: { eventType: ServiceEventType.BRAKE_SERVICE },
          orderBy: { eventDate: 'desc' },
          take: 20,
        },
        documentExtractions: {
          where: {
            effectiveDocumentType: 'BRAKE',
            status: { in: ['CONFIRMED', 'APPLIED'] },
          },
          orderBy: { appliedAt: 'desc' },
          take: 10,
        },
        enrichmentJobs: {
          where: { jobType: EnrichmentJobType.BRAKE },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        dtcEvents: {
          where: { isActive: true },
          select: { dtcCode: true },
        },
        latestState: { select: { odometerKm: true } },
        handoverProtocols: {
          select: { id: true, performedAt: true, odometerKm: true },
          orderBy: { performedAt: 'desc' },
          take: 10,
        },
        energyEvents: {
          where: { odometerEndKm: { not: null } },
          select: { id: true, endTime: true, odometerEndKm: true },
          orderBy: { endTime: 'desc' },
          take: 20,
        },
        _count: {
          select: {
            trips: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      ...(options?.limit ? { take: options.limit } : {}),
    });

    const legacyDiagnostics = await this.enrichmentDiagnostics.diagnoseLegacyBrakeJobs({
      organizationId: options?.organizationId,
      vehicleId: options?.vehicleId,
      limit: options?.limit,
    });
    const legacyByVehicle = new Map(
      legacyDiagnostics.jobs.map((job) => [job.vehicleId, job.classification]),
    );

    return vehicles.map((vehicle) => {
      const spec = vehicle.brakeSpecs[0] ?? null;
      const bhc = vehicle.brakeHealthCurrent;
      const baselineWarnings = Array.isArray(bhc?.baselineWarnings)
        ? (bhc!.baselineWarnings as string[])
        : [];

      const odometerSignals = [
        ...(vehicle.latestState?.odometerKm != null
          ? [
              {
                source: 'LATEST_STATE',
                odometerKm: String(vehicle.latestState.odometerKm),
                observedAt: new Date().toISOString(),
                refId: `${vehicle.id}:latest`,
              },
            ]
          : []),
        ...vehicle.handoverProtocols
          .filter((h) => h.odometerKm != null)
          .map((h) => ({
            source: 'HANDOVER_PROTOCOL',
            odometerKm: String(h.odometerKm),
            observedAt: h.performedAt.toISOString(),
            refId: h.id,
          })),
        ...vehicle.energyEvents
          .filter((e) => e.odometerEndKm != null && e.endTime != null)
          .map((e) => ({
            source: 'TRIP_ODOMETER_BOUNDARY',
            odometerKm: String(e.odometerEndKm),
            observedAt: e.endTime!.toISOString(),
            refId: e.id,
          })),
      ];

      const activeDtcCount = vehicle.dtcEvents.filter((d) =>
        isBrakeRelatedDtcCode(d.dtcCode),
      ).length;

      return buildVehicleBrakeBaselineAuditInput({
        vehicleId: vehicle.id,
        organizationId: vehicle.organizationId,
        registeredAt: vehicle.createdAt.toISOString(),
        registrationMileageKm: vehicle.mileageKm,
        brakeHealthCurrent: bhc
          ? {
              isInitialized: bhc.isInitialized,
              stateClass: bhc.stateClass,
              anchorValidationStatus: bhc.anchorValidationStatus,
              anchorServiceDate: bhc.anchorServiceDate?.toISOString() ?? null,
              anchorOdometerKm: bhc.anchorOdometerKm,
              hasAlert: bhc.hasAlert,
              baselineWarnings,
              frontPadAnchorMm: bhc.frontPadAnchorMm,
              rearPadAnchorMm: bhc.rearPadAnchorMm,
              frontDiscAnchorMm: bhc.frontDiscAnchorMm,
              rearDiscAnchorMm: bhc.rearDiscAnchorMm,
            }
          : null,
        referenceSpec: spec
          ? {
              sourceType: spec.sourceType,
              createdAt: spec.createdAt.toISOString(),
              frontPadThickness: spec.frontPadThickness,
              rearPadThickness: spec.rearPadThickness,
              frontRotorWidth: spec.frontRotorWidth,
              rearRotorWidth: spec.rearRotorWidth,
            }
          : null,
        evidence: vehicle.brakeEvidence.map((ev) => ({
          id: ev.id,
          source: ev.source,
          axle: ev.axle,
          measuredPadMm: ev.measuredPadMm != null ? String(ev.measuredPadMm) : '',
          measuredDiscMm: ev.measuredDiscMm != null ? String(ev.measuredDiscMm) : '',
          mileageAtMeasurementKm:
            ev.mileageAtMeasurementKm != null ? String(ev.mileageAtMeasurementKm) : '',
          measuredAt: ev.measuredAt?.toISOString() ?? '',
          confidence: ev.confidence,
        })),
        serviceEvents: vehicle.serviceEvents.map((ev) => ({
          id: ev.id,
          eventDate: ev.eventDate.toISOString(),
          odometerKm: ev.odometerKm != null ? String(ev.odometerKm) : '',
          brakeServiceKind: ev.brakeServiceKind ?? '',
          brakeServiceScope: ev.brakeServiceScope ? JSON.stringify(ev.brakeServiceScope) : '[]',
          brakeMeasuredSnapshot: ev.brakeMeasuredSnapshot
            ? JSON.stringify(ev.brakeMeasuredSnapshot)
            : '{}',
        })),
        documents: vehicle.documentExtractions.map((doc) => {
          const payload = (doc.confirmedData ?? doc.extractedData) as Record<string, unknown> | null;
          const odometerKm = payload?.odometerKm != null ? String(payload.odometerKm) : '';
          const confirmedAt =
            doc.appliedAt?.toISOString() ??
            doc.processedAt?.toISOString() ??
            doc.extractionCompletedAt?.toISOString() ??
            vehicle.createdAt.toISOString();
          return {
            id: doc.id,
            confirmedAt,
            odometerKm,
            status: doc.status,
          };
        }),
        odometerSignals,
        enrichmentJobs: vehicle.enrichmentJobs.map((job) => ({
          status: job.status,
          classification: legacyByVehicle.get(vehicle.id) ?? null,
        })),
        tripCountSinceRegistration: vehicle._count.trips,
        activeDtcCount,
        auditSalt,
      });
    });
  }
}
