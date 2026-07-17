import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BrakeAxle,
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationStatus,
  BrakeComponentInstallationType,
  BrakeEvidenceConfidence,
  BrakeEvidenceSource,
  BrakeServiceApplicationStatus,
  BrakeServiceKind,
  BrakeServiceOutboxEventType,
  BrakeServiceSource,
  Prisma,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import {
  defaultMinimumThicknessMm,
  isPrismaActiveComponentConflict,
  validateBrakeComponentInstallation,
} from './brake-component-installation.invariants';
import {
  componentToLifecycleScope,
  thicknessFieldForComponent,
  type BrakeLifecycleScopeToken,
} from './brake-component-lifecycle.scope';
import { BrakeHealthService } from './brake-health.service';
import {
  BrakeServiceApplicationErrorCode,
  buildBrakeServiceIdempotencyKey,
  hashBrakeServiceRequest,
} from './brake-service-application.domain';
import type {
  ApplyBrakeServiceInput,
  ApplyBrakeServiceResult,
  BrakeServiceApplicationAuditEntry,
} from './brake-service-application.types';
import { BrakeServiceOutboxService } from './brake-service-outbox.service';
import {
  componentToScopeToken,
  resolveServiceComponentScope,
  serviceKindAllowsReplacement,
  serviceKindIsHistoryOnly,
  type BrakeMeasuredSnapshot,
} from './brake-service-scope.matrix';

@Injectable()
export class BrakeServiceApplicationService {
  private readonly logger = new Logger(BrakeServiceApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeHealth: BrakeHealthService,
    private readonly outbox: BrakeServiceOutboxService,
  ) {}

  async apply(input: ApplyBrakeServiceInput): Promise<ApplyBrakeServiceResult> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, organizationId: input.organizationId },
      select: { id: true, organizationId: true },
    });
    if (!vehicle) {
      throw new BadRequestException(BrakeServiceApplicationErrorCode.ORGANIZATION_VEHICLE_MISMATCH);
    }

    const serviceDate = new Date(input.serviceDate);
    if (Number.isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid serviceDate');
    }

    const measured = this.normalizeMeasured(input.measured);
    const kind = this.toKindEnum(input.kind);
    const source = this.toSourceEnum(input.source);
    const scope = this.normalizeScope(input.scope);
    const requestPayload = this.buildRequestPayload(input, measured, kind, scope);
    const requestHash = hashBrakeServiceRequest(requestPayload);

    let idempotencyKey: string;
    try {
      idempotencyKey = buildBrakeServiceIdempotencyKey({
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        clientRequestId: input.clientRequestId,
        externalDocumentId: input.externalDocumentId,
        explicitKey: input.idempotencyKey,
      });
    } catch {
      throw new BadRequestException(BrakeServiceApplicationErrorCode.IDEMPOTENCY_KEY_REQUIRED);
    }

    const claim = await this.claimApplication({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      idempotencyKey,
      requestHash,
      requestPayload,
      clientRequestId: input.clientRequestId,
      externalDocumentId: input.externalDocumentId,
      actorUserId: input.actorUserId,
    });

    if (claim.replayed) {
      const replay =
        claim.result ??
        ((
          await this.prisma.brakeServiceApplication.findUnique({
            where: { id: claim.applicationId },
          })
        )?.resultJson as ApplyBrakeServiceResult | null);
      if (replay) {
        return { ...replay, replayed: true };
      }
    }

    let resolvedComponents: BrakeComponentInstallationType[] = [];
    if (serviceKindIsHistoryOnly(kind)) {
      if (scope.length > 0) {
        throw new BadRequestException(
          kind === BrakeServiceKind.INSPECTION_ONLY
            ? 'inspection_scope_not_allowed'
            : 'fluid_service_scope_not_allowed',
        );
      }
    } else if (serviceKindAllowsReplacement(kind)) {
      try {
        const resolved = resolveServiceComponentScope({
          kind,
          scope: scope as BrakeLifecycleScopeToken[],
          measured,
          allowMeasurementInference: true,
        });
        resolvedComponents = resolved.components;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'invalid_service_scope';
        await this.markFailed(claim.applicationId, message);
        throw new BadRequestException(message);
      }
    }

    const auditLog: BrakeServiceApplicationAuditEntry[] = [
      { at: new Date().toISOString(), action: 'APPLICATION_CLAIMED', details: claim.applicationId },
    ];

    try {
      const txResult = await this.prisma.$transaction(async (tx) => {
        const serviceEvent = await tx.vehicleServiceEvent.create({
          data: {
            vehicleId: input.vehicleId,
            eventType: ServiceEventType.BRAKE_SERVICE,
            eventDate: serviceDate,
            odometerKm:
              typeof input.odometerKm === 'number' && Number.isFinite(input.odometerKm)
                ? Math.round(input.odometerKm)
                : undefined,
            workshopName: input.workshopName?.trim() || undefined,
            notes: input.notes?.trim() || undefined,
            documentUrl: input.documentUrl || undefined,
            brakeServiceKind: kind,
            brakeServiceSource: source,
            brakeServiceScope:
              resolvedComponents.length > 0
                ? resolvedComponents.map(componentToScopeToken)
                : scope.length > 0
                  ? scope
                  : undefined,
            brakeMeasuredSnapshot: this.hasMeasuredBaseline(measured) ? measured : undefined,
            brakeApplicationStatus: BrakeServiceApplicationStatus.PENDING,
            brakeLifecycleApplied: false,
            origin:
              source === BrakeServiceSource.AI_DOCUMENT
                ? ServiceEventOrigin.AI_UPLOAD
                : ServiceEventOrigin.MANUAL,
          },
        });
        auditLog.push({
          at: new Date().toISOString(),
          action: 'SERVICE_EVENT_CREATED',
          serviceEventId: serviceEvent.id,
        });

        await tx.brakeServiceApplication.update({
          where: { id: claim.applicationId },
          data: {
            serviceEventId: serviceEvent.id,
            status: BrakeServiceApplicationStatus.PROCESSING,
          },
        });

        const installationIds: string[] = [];
        const evidenceIds: string[] = [];
        const anchors = await this.buildAnchors(
          tx,
          input.vehicleId,
          resolvedComponents,
          measured,
        );

        if (resolvedComponents.length > 0 && input.initializeIfPossible !== false) {
          const odometerKm = this.normalizeOdometer(input.odometerKm);
          for (const componentType of resolvedComponents) {
            const anchor = anchors.find((a) => a.componentType === componentType);
            const existingActive = await tx.brakeComponentInstallation.findFirst({
              where: {
                vehicleId: input.vehicleId,
                componentType,
                status: BrakeComponentInstallationStatus.ACTIVE,
                removedAt: null,
              },
            });

            if (existingActive) {
              validateBrakeComponentInstallation({
                organizationId: input.organizationId,
                vehicleOrganizationId: vehicle.organizationId,
                componentType,
                installedAt: existingActive.installedAt,
                installedOdometerKm: existingActive.installedOdometerKm,
                removedAt: serviceDate,
                removedOdometerKm: odometerKm,
                status: BrakeComponentInstallationStatus.REMOVED,
              });
              await tx.brakeComponentInstallation.update({
                where: { id: existingActive.id },
                data: {
                  status: BrakeComponentInstallationStatus.REMOVED,
                  removedAt: serviceDate,
                  removedOdometerKm: odometerKm,
                },
              });
              auditLog.push({
                at: new Date().toISOString(),
                action: 'SUPERSEDE_INSTALLATION',
                installationId: existingActive.id,
                details: componentType,
              });
            }

            if (anchor?.anchorThicknessMm != null) {
              validateBrakeComponentInstallation({
                organizationId: input.organizationId,
                vehicleOrganizationId: vehicle.organizationId,
                componentType,
                installedAt: serviceDate,
                installedOdometerKm: odometerKm,
                status: BrakeComponentInstallationStatus.ACTIVE,
                serviceEventId: serviceEvent.id,
              });
              const created = await tx.brakeComponentInstallation.create({
                data: {
                  organizationId: vehicle.organizationId,
                  vehicleId: input.vehicleId,
                  componentType,
                  installedAt: serviceDate,
                  installedOdometerKm: odometerKm,
                  status: BrakeComponentInstallationStatus.ACTIVE,
                  anchorThicknessMm: anchor.anchorThicknessMm,
                  anchorSource: anchor.anchorSource,
                  anchorMeasuredAt:
                    anchor.anchorSource === BrakeComponentInstallationAnchorSource.MEASURED
                      ? serviceDate
                      : null,
                  minimumThicknessMm: defaultMinimumThicknessMm(componentType),
                  serviceEventId: serviceEvent.id,
                  modelVersionAtInstallation: BRAKE_HEALTH_CONFIG.MODEL_VERSION,
                },
              });
              installationIds.push(created.id);
              auditLog.push({
                at: new Date().toISOString(),
                action: 'CREATE_INSTALLATION',
                installationId: created.id,
                serviceEventId: serviceEvent.id,
              });
            }
          }

          if (anchors.length > 0) {
            await this.brakeHealth.applyScopedComponentAnchorsInTx(
              tx,
              input.vehicleId,
              vehicle.organizationId,
              {
                serviceDate,
                odometerKm: this.normalizeOdometer(input.odometerKm),
                components: anchors,
                resetWearCalibration: false,
              },
            );
            auditLog.push({
              at: new Date().toISOString(),
              action: 'BHC_SCOPED_UPDATE',
              serviceEventId: serviceEvent.id,
            });
          }
        }

        if (
          this.hasMeasuredBaseline(measured) &&
          input.source !== 'ai_document'
        ) {
          const rows = this.buildEvidenceRows(
            input.vehicleId,
            serviceEvent.id,
            serviceDate,
            this.normalizeOdometer(input.odometerKm),
            measured,
            resolvedComponents,
            kind,
            source,
          );
          for (const row of rows) {
            const created = await tx.brakeEvidence.create({ data: row });
            evidenceIds.push(created.id);
            auditLog.push({
              at: new Date().toISOString(),
              action: 'EVIDENCE_CREATED',
              evidenceId: created.id,
              serviceEventId: serviceEvent.id,
            });
          }
        }

        const isHistoryOnly =
          serviceKindIsHistoryOnly(kind) ||
          resolvedComponents.length === 0 ||
          input.initializeIfPossible === false;
        const applicationStatus = isHistoryOnly
          ? BrakeServiceApplicationStatus.HISTORY_ONLY
          : BrakeServiceApplicationStatus.APPLIED;
        const lifecycleApplied = !isHistoryOnly && (installationIds.length > 0 || anchors.length > 0);
        const message = isHistoryOnly
          ? kind === BrakeServiceKind.INSPECTION_ONLY
            ? 'Brake inspection recorded. Wear anchors were not changed.'
            : kind === BrakeServiceKind.BRAKE_FLUID_SERVICE
              ? 'Brake fluid service recorded. Pad/disc wear anchors were not changed.'
              : 'Brake service history logged.'
          : lifecycleApplied
            ? 'Brake service applied atomically with scoped component lifecycle.'
            : 'Brake service recorded without health mutation.';

        await tx.vehicleServiceEvent.update({
          where: { id: serviceEvent.id },
          data: {
            brakeApplicationStatus: applicationStatus,
            brakeLifecycleApplied: lifecycleApplied,
            brakeLifecycleNote: auditLog.map((e) => e.action).join(' → '),
          },
        });

        const result: ApplyBrakeServiceResult = {
          applicationId: claim.applicationId,
          serviceEventId: serviceEvent.id,
          replayed: false,
          lifecycleApplied,
          initialized: lifecycleApplied,
          status: lifecycleApplied ? 'initialized' : 'history_only',
          applicationStatus:
            applicationStatus === BrakeServiceApplicationStatus.HISTORY_ONLY
              ? 'HISTORY_ONLY'
              : 'APPLIED',
          message,
          auditLog,
          installationIds,
          evidenceIds,
          outboxProcessed: false,
        };

        await tx.brakeServiceApplication.update({
          where: { id: claim.applicationId },
          data: {
            status: applicationStatus,
            resultJson: result as unknown as Prisma.InputJsonValue,
            auditLog: auditLog as unknown as Prisma.InputJsonValue,
            appliedAt: new Date(),
          },
        });

        if (lifecycleApplied) {
          await this.outbox.enqueueInTransaction(tx, {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            applicationId: claim.applicationId,
            serviceEventId: serviceEvent.id,
            eventTypes: [
              BrakeServiceOutboxEventType.RECALCULATE,
              BrakeServiceOutboxEventType.RESOLVE_ALERTS,
            ],
          });
          auditLog.push({
            at: new Date().toISOString(),
            action: 'OUTBOX_ENQUEUED',
            serviceEventId: serviceEvent.id,
          });
        }

        return result;
      });

      const outbox = await this.outbox.processForApplication(claim.applicationId);
      txResult.outboxProcessed = outbox.processed > 0;

      await this.prisma.brakeServiceApplication.update({
        where: { id: claim.applicationId },
        data: {
          resultJson: txResult as unknown as Prisma.InputJsonValue,
          auditLog: txResult.auditLog as unknown as Prisma.InputJsonValue,
        },
      });

      return txResult;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      await this.recordComplianceFailure(input, claim.applicationId, serviceDate, kind, source, measured, scope, errMsg);
      if (isPrismaActiveComponentConflict(error)) {
        throw new ConflictException('Duplicate active component installation');
      }
      throw error;
    }
  }

  private async claimApplication(input: {
    organizationId: string;
    vehicleId: string;
    idempotencyKey: string;
    requestHash: string;
    requestPayload: Record<string, unknown>;
    clientRequestId?: string;
    externalDocumentId?: string;
    actorUserId?: string;
  }): Promise<{
    applicationId: string;
    replayed: boolean;
    result?: ApplyBrakeServiceResult;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.brakeServiceApplication.findUnique({
        where: {
          organizationId_vehicleId_idempotencyKey: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new ConflictException(BrakeServiceApplicationErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH);
        }
        if (
          existing.status === BrakeServiceApplicationStatus.APPLIED ||
          existing.status === BrakeServiceApplicationStatus.HISTORY_ONLY
        ) {
          return {
            applicationId: existing.id,
            replayed: true,
            result: existing.resultJson as ApplyBrakeServiceResult,
          };
        }
        if (existing.status === BrakeServiceApplicationStatus.PROCESSING) {
          throw new ConflictException(
            BrakeServiceApplicationErrorCode.CONCURRENT_APPLICATION_IN_PROGRESS,
          );
        }
        if (existing.status === BrakeServiceApplicationStatus.FAILED) {
          const resumed = await tx.brakeServiceApplication.update({
            where: { id: existing.id },
            data: {
              status: BrakeServiceApplicationStatus.PENDING,
              failedAt: null,
              errorCode: null,
              errorMessage: null,
            },
          });
          return { applicationId: resumed.id, replayed: false };
        }
        return { applicationId: existing.id, replayed: false };
      }

      const created = await tx.brakeServiceApplication.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          idempotencyKey: input.idempotencyKey,
          clientRequestId: input.clientRequestId,
          externalDocumentId: input.externalDocumentId,
          requestHash: input.requestHash,
          requestPayload: input.requestPayload as Prisma.InputJsonValue,
          status: BrakeServiceApplicationStatus.PENDING,
          actorUserId: input.actorUserId,
        },
      });
      return { applicationId: created.id, replayed: false };
    });
  }

  private async markFailed(applicationId: string, message: string): Promise<void> {
    await this.prisma.brakeServiceApplication.update({
      where: { id: applicationId },
      data: {
        status: BrakeServiceApplicationStatus.FAILED,
        errorCode: BrakeServiceApplicationErrorCode.APPLICATION_FAILED,
        errorMessage: message,
        failedAt: new Date(),
      },
    });
  }

  private async recordComplianceFailure(
    input: ApplyBrakeServiceInput,
    applicationId: string,
    serviceDate: Date,
    kind: BrakeServiceKind,
    source: BrakeServiceSource,
    measured: BrakeMeasuredSnapshot,
    scope: string[],
    errMsg: string,
  ): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const serviceEvent = await tx.vehicleServiceEvent.create({
          data: {
            vehicleId: input.vehicleId,
            eventType: ServiceEventType.BRAKE_SERVICE,
            eventDate: serviceDate,
            odometerKm:
              typeof input.odometerKm === 'number' && Number.isFinite(input.odometerKm)
                ? Math.round(input.odometerKm)
                : undefined,
            workshopName: input.workshopName?.trim() || undefined,
            notes: input.notes?.trim() || undefined,
            documentUrl: input.documentUrl || undefined,
            brakeServiceKind: kind,
            brakeServiceSource: source,
            brakeServiceScope: scope.length > 0 ? scope : undefined,
            brakeMeasuredSnapshot: this.hasMeasuredBaseline(measured) ? measured : undefined,
            brakeApplicationStatus: BrakeServiceApplicationStatus.FAILED,
            brakeLifecycleApplied: false,
            brakeLifecycleNote: `Application failed: ${errMsg}`,
            origin:
              source === BrakeServiceSource.AI_DOCUMENT
                ? ServiceEventOrigin.AI_UPLOAD
                : ServiceEventOrigin.MANUAL,
          },
        });

        await tx.brakeServiceApplication.update({
          where: { id: applicationId },
          data: {
            status: BrakeServiceApplicationStatus.FAILED,
            serviceEventId: serviceEvent.id,
            errorCode: BrakeServiceApplicationErrorCode.APPLICATION_FAILED,
            errorMessage: errMsg,
            failedAt: new Date(),
          },
        });
      });
    } catch (persistErr) {
      this.logger.warn(
        `Failed to persist compliance failure for application ${applicationId}: ${persistErr}`,
      );
    }
  }

  private async buildAnchors(
    tx: Prisma.TransactionClient,
    vehicleId: string,
    components: BrakeComponentInstallationType[],
    measured: BrakeMeasuredSnapshot,
  ) {
    const specs = await tx.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const spec = specs[0];

    return components
      .map((componentType) => {
        const field = thicknessFieldForComponent(componentType);
        const measuredMm = measured[field];
        const specMm = this.specThicknessForComponent(componentType, spec);
        const anchorThicknessMm = measuredMm ?? specMm;
        if (anchorThicknessMm == null) return null;
        return {
          componentType,
          anchorThicknessMm,
          anchorSource:
            measuredMm != null
              ? BrakeComponentInstallationAnchorSource.MEASURED
              : BrakeComponentInstallationAnchorSource.SPEC_NOMINAL,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  private buildEvidenceRows(
    vehicleId: string,
    serviceEventId: string,
    measuredAt: Date,
    odometerKm: number | null,
    measured: BrakeMeasuredSnapshot,
    scopedComponents: BrakeComponentInstallationType[],
    kind: BrakeServiceKind,
    source: BrakeServiceSource,
  ): Prisma.BrakeEvidenceUncheckedCreateInput[] {
    const evidenceSource =
      source === BrakeServiceSource.API ? BrakeEvidenceSource.MANUAL_MEASUREMENT : BrakeEvidenceSource.WORKSHOP_REPORT;
    const base = {
      vehicleId,
      confidence: BrakeEvidenceConfidence.HIGH,
      mileageAtMeasurementKm: odometerKm,
      measuredAt,
      serviceEventId,
    };

    const includeFront =
      serviceKindIsHistoryOnly(kind) ||
      scopedComponents.includes(BrakeComponentInstallationType.FRONT_PADS) ||
      scopedComponents.includes(BrakeComponentInstallationType.FRONT_DISCS);
    const includeRear =
      serviceKindIsHistoryOnly(kind) ||
      scopedComponents.includes(BrakeComponentInstallationType.REAR_PADS) ||
      scopedComponents.includes(BrakeComponentInstallationType.REAR_DISCS);

    const rows: Prisma.BrakeEvidenceUncheckedCreateInput[] = [];
    if (includeFront && (measured.frontPadMm != null || measured.frontDiscMm != null)) {
      rows.push({
        ...base,
        source: evidenceSource,
        axle: BrakeAxle.FRONT,
        measuredPadMm: measured.frontPadMm,
        measuredDiscMm: measured.frontDiscMm,
      });
    }
    if (includeRear && (measured.rearPadMm != null || measured.rearDiscMm != null)) {
      rows.push({
        ...base,
        source: evidenceSource,
        axle: BrakeAxle.REAR,
        measuredPadMm: measured.rearPadMm,
        measuredDiscMm: measured.rearDiscMm,
      });
    }
    return rows;
  }

  private buildRequestPayload(
    input: ApplyBrakeServiceInput,
    measured: BrakeMeasuredSnapshot,
    kind: BrakeServiceKind,
    scope: string[],
  ): Record<string, unknown> {
    return {
      vehicleId: input.vehicleId,
      serviceDate: input.serviceDate,
      odometerKm: input.odometerKm ?? null,
      kind,
      scope,
      measured,
      source: input.source ?? 'manual',
      initializeIfPossible: input.initializeIfPossible !== false,
    };
  }

  private specThicknessForComponent(
    component: BrakeComponentInstallationType,
    spec?: {
      frontPadThickness?: number | null;
      rearPadThickness?: number | null;
      frontRotorWidth?: number | null;
      rearRotorWidth?: number | null;
    } | null,
  ): number | null {
    if (!spec) return null;
    switch (component) {
      case BrakeComponentInstallationType.FRONT_PADS:
        return this.normalizePositive(spec.frontPadThickness);
      case BrakeComponentInstallationType.REAR_PADS:
        return this.normalizePositive(spec.rearPadThickness);
      case BrakeComponentInstallationType.FRONT_DISCS:
        return this.normalizePositive(spec.frontRotorWidth);
      case BrakeComponentInstallationType.REAR_DISCS:
        return this.normalizePositive(spec.rearRotorWidth);
      default:
        return null;
    }
  }

  private normalizeScope(scope?: ApplyBrakeServiceInput['scope']): string[] {
    if (!Array.isArray(scope)) return [];
    return Array.from(new Set(scope));
  }

  private normalizeMeasured(measured?: ApplyBrakeServiceInput['measured']): BrakeMeasuredSnapshot {
    const toNum = (v: unknown): number | null => {
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
      return Math.round(v * 100) / 100;
    };
    return {
      frontPadMm: toNum(measured?.frontPadMm),
      rearPadMm: toNum(measured?.rearPadMm),
      frontDiscMm: toNum(measured?.frontDiscMm),
      rearDiscMm: toNum(measured?.rearDiscMm),
    };
  }

  private normalizePositive(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
    return Math.round(value * 100) / 100;
  }

  private normalizeOdometer(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    return Math.round(value);
  }

  private hasMeasuredBaseline(measured: BrakeMeasuredSnapshot): boolean {
    return (
      measured.frontPadMm != null ||
      measured.rearPadMm != null ||
      measured.frontDiscMm != null ||
      measured.rearDiscMm != null
    );
  }

  private toSourceEnum(source?: ApplyBrakeServiceInput['source']): BrakeServiceSource {
    if (source === 'ai_document') return BrakeServiceSource.AI_DOCUMENT;
    if (source === 'api' || source === 'manual_registration') return BrakeServiceSource.API;
    return BrakeServiceSource.MANUAL;
  }

  private toKindEnum(kind?: ApplyBrakeServiceInput['kind']): BrakeServiceKind {
    if (kind === 'inspection_only') return BrakeServiceKind.INSPECTION_ONLY;
    if (kind === 'pads_service') return BrakeServiceKind.PADS_SERVICE;
    if (kind === 'discs_service') return BrakeServiceKind.DISCS_SERVICE;
    if (kind === 'brake_fluid_service') return BrakeServiceKind.BRAKE_FLUID_SERVICE;
    return BrakeServiceKind.FULL_BRAKE_SERVICE;
  }
}
