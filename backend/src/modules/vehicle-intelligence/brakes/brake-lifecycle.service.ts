import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import {
  BrakeAxle,
  BrakeComponentStatus,
  BrakeEvidenceConfidence,
  BrakeEvidenceSource,
  BrakeServiceKind,
  BrakeServiceSource,
  Prisma,
  ServiceEventOrigin,
  ServiceEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeHealthService } from './brake-health.service';
import { BrakeEvidenceService, type BrakeEvidenceWriteInput } from './brake-evidence.service';
import { hashBrakeServiceRequest } from './brake-service-application.domain';
import { BrakeServiceApplicationService } from './brake-service-application.service';
import {
  applyNewBrakeDefaults,
  normalizeRegistrationBrakeCondition,
  type RegistrationBrakeManualSpec,
  registrationBrakeMeasuredSnapshot,
  resolveRegistrationBrakeOdometerKm,
  shouldInitializeBrakesFromRegistration,
} from './register-brake-baseline';
import { inferScopeFromMeasurements } from './brake-service-scope.matrix';
import type { BrakeLifecycleScope } from './brake-lifecycle.types';

export type {
  BrakeLifecycleKind,
  BrakeLifecycleScope,
  BrakeLifecycleSource,
  RecordBrakeServiceInput,
  RecordBrakeServiceResult,
} from './brake-lifecycle.types';

export type ApplyBrakeFromDocumentExtractionInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  measurementDate: Date;
  serviceKind: import('./brake-lifecycle.types').BrakeLifecycleKind | null;
  scope: BrakeLifecycleScope[];
  thicknessUnit: 'mm';
  odometerKm: number | null;
  workshopName: string | null;
  workshopFinding: string | null;
  notes: string | null;
  documentUrl?: string | null;
  frontPadMm: number | null;
  rearPadMm: number | null;
  frontDiscMm: number | null;
  rearDiscMm: number | null;
  discCondition: string | null;
  brakeFluidStatus: string | null;
  immediateReplacement: boolean | null;
};

export type ApplyBrakeFromDocumentExtractionResult =
  import('./brake-lifecycle.types').RecordBrakeServiceResult & {
    evidenceIds: string[];
  };

@Injectable()
export class BrakeLifecycleService {
  private readonly logger = new Logger(BrakeLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly application: BrakeServiceApplicationService,
    @Optional() private readonly brakeHealth?: BrakeHealthService,
    @Optional() private readonly brakeEvidence?: BrakeEvidenceService,
  ) {}

  async recordService(
    input: import('./brake-lifecycle.types').RecordBrakeServiceInput,
  ): Promise<import('./brake-lifecycle.types').RecordBrakeServiceResult> {
    if (!input.vehicleId) {
      throw new BadRequestException('vehicleId is required');
    }

    const organizationId =
      input.organizationId ??
      (
        await this.prisma.vehicle.findUnique({
          where: { id: input.vehicleId },
          select: { organizationId: true },
        })
      )?.organizationId;

    if (!organizationId) {
      throw new BadRequestException('vehicle_not_found');
    }

    const clientRequestId =
      input.clientRequestId ??
      input.idempotencyKey ??
      `lifecycle:${hashBrakeServiceRequest({
        vehicleId: input.vehicleId,
        serviceDate: input.serviceDate,
        kind: input.kind ?? 'full_brake_service',
        scope: input.scope ?? [],
        measured: input.measured ?? {},
        odometerKm: input.odometerKm ?? null,
      }).slice(0, 24)}`;

    try {
      const result = await this.application.apply({
        organizationId,
        vehicleId: input.vehicleId,
        serviceDate: input.serviceDate,
        odometerKm: input.odometerKm,
        workshopName: input.workshopName,
        notes: input.notes,
        documentUrl: input.documentUrl,
        source: input.source,
        kind: input.kind,
        scope: input.scope,
        measured: input.measured,
        initializeIfPossible: input.initializeIfPossible,
        clientRequestId,
        externalDocumentId: input.externalDocumentId,
        idempotencyKey: input.idempotencyKey,
        actorUserId: input.actorUserId,
      });

      return {
        serviceEventId: result.serviceEventId,
        lifecycleApplied: result.lifecycleApplied,
        initialized: result.initialized,
        status: result.status,
        message: result.message,
        applicationId: result.applicationId,
        replayed: result.replayed,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Baseline initialization failed';
      this.logger.warn(
        `Brake lifecycle apply failed for vehicle ${input.vehicleId}: ${errMsg}`,
      );
      const failedEvent = await this.prisma.vehicleServiceEvent.findFirst({
        where: { vehicleId: input.vehicleId, eventType: 'BRAKE_SERVICE' },
        orderBy: { eventDate: 'desc' },
      });
      return {
        serviceEventId: failedEvent?.id ?? '',
        lifecycleApplied: false,
        initialized: false,
        status: 'history_only',
        message: `Brake service history logged, but baseline initialization failed: ${errMsg}`,
      };
    }
  }

  async applyFromDocumentExtraction(
    input: ApplyBrakeFromDocumentExtractionInput,
  ): Promise<ApplyBrakeFromDocumentExtractionResult> {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
    }
    if (!this.brakeHealth || !this.brakeEvidence) {
      throw new BadRequestException('Brake document apply dependencies are not configured');
    }

    const measured = {
      frontPadMm: input.frontPadMm,
      rearPadMm: input.rearPadMm,
      frontDiscMm: input.frontDiscMm,
      rearDiscMm: input.rearDiscMm,
    };
    const hasMeasuredBaseline = this.hasMeasuredBaseline(measured);
    const serviceDate = input.measurementDate;
    const notes = input.notes ?? input.workshopFinding ?? undefined;
    const kind = this.toKindEnum(input.serviceKind ?? undefined);
    const scope = this.normalizeScope(input.scope);
    const allowsSpecFallback =
      kind === BrakeServiceKind.PADS_SERVICE ||
      kind === BrakeServiceKind.DISCS_SERVICE ||
      kind === BrakeServiceKind.FULL_BRAKE_SERVICE;

    const existingEvent = await this.prisma.vehicleServiceEvent.findUnique({
      where: {
        organizationId_documentExtractionId: {
          organizationId: input.organizationId,
          documentExtractionId: input.documentExtractionId,
        },
      },
    });
    const existingEvidence = await this.prisma.brakeEvidence.findMany({
      where: { documentExtractionId: input.documentExtractionId },
      select: { id: true, axle: true },
    });

    const expectedAxles = new Set<BrakeAxle>();
    if (measured.frontPadMm != null || measured.frontDiscMm != null) {
      expectedAxles.add(BrakeAxle.FRONT);
    }
    if (measured.rearPadMm != null || measured.rearDiscMm != null) {
      expectedAxles.add(BrakeAxle.REAR);
    }
    const evidenceComplete =
      existingEvidence.length > 0 &&
      Array.from(expectedAxles).every((axle) =>
        existingEvidence.some((row) => row.axle === axle),
      );

    if (existingEvent && evidenceComplete) {
      return {
        serviceEventId: existingEvent.id,
        lifecycleApplied: existingEvent.brakeLifecycleApplied === true,
        initialized: existingEvent.brakeLifecycleApplied === true,
        status: existingEvent.brakeLifecycleApplied ? 'initialized' : 'history_only',
        message: existingEvent.brakeLifecycleNote ?? 'Brake document already applied.',
        evidenceIds: existingEvidence.map((row) => row.id),
      };
    }

    let serviceEvent = existingEvent;
    if (!serviceEvent) {
      try {
        serviceEvent = await this.prisma.vehicleServiceEvent.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            documentExtractionId: input.documentExtractionId,
            eventType: ServiceEventType.BRAKE_SERVICE,
            eventDate: serviceDate,
            odometerKm:
              typeof input.odometerKm === 'number' && Number.isFinite(input.odometerKm)
                ? Math.round(input.odometerKm)
                : null,
            workshopName: input.workshopName?.trim() || null,
            notes: notes?.trim() || null,
            documentUrl: input.documentUrl ?? null,
            brakeServiceKind: kind,
            brakeServiceSource: BrakeServiceSource.AI_DOCUMENT,
            brakeServiceScope: scope.length > 0 ? scope : undefined,
            brakeMeasuredSnapshot: hasMeasuredBaseline ? measured : undefined,
            origin: ServiceEventOrigin.AI_UPLOAD,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          serviceEvent = await this.prisma.vehicleServiceEvent.findUnique({
            where: {
              organizationId_documentExtractionId: {
                organizationId: input.organizationId,
                documentExtractionId: input.documentExtractionId,
              },
            },
          });
        }
        if (!serviceEvent) {
          throw error;
        }
      }
    }

    let initialized = serviceEvent.brakeLifecycleApplied === true;
    let lifecycleApplied = serviceEvent.brakeLifecycleApplied === true;
    let status: import('./brake-lifecycle.types').RecordBrakeServiceResult['status'] =
      serviceEvent.brakeLifecycleApplied ? 'initialized' : 'history_only';
    let message =
      serviceEvent.brakeLifecycleNote ??
      'Brake service history logged. No measured thickness baseline was applied.';

    if (
      !serviceEvent.brakeLifecycleApplied &&
      (hasMeasuredBaseline || allowsSpecFallback)
    ) {
      try {
        const init = await this.brakeHealth.initializeFromService(input.vehicleId, {
          serviceDate: serviceDate.toISOString(),
          odometerKm: input.odometerKm ?? undefined,
          frontPadMm: measured.frontPadMm ?? undefined,
          rearPadMm: measured.rearPadMm ?? undefined,
          frontRotorWidthMm: measured.frontDiscMm ?? undefined,
          rearRotorWidthMm: measured.rearDiscMm ?? undefined,
        });
        initialized = init?.initialized === true;
        lifecycleApplied = init?.initialized === true;
        status = init?.initialized === true ? 'initialized' : 'history_only';
        message =
          init?.message ??
          (hasMeasuredBaseline
            ? 'Brake health baseline initialized from measured service data.'
            : 'Brake service history recorded. Baseline was not strong enough for initialization.');
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Baseline initialization failed';
        this.logger.warn(
          `Brake lifecycle initialize failed for vehicle ${input.vehicleId}: ${errMsg}`,
        );
        message = `Brake service history logged, but baseline initialization failed: ${errMsg}`;
      }

      await this.prisma.vehicleServiceEvent.update({
        where: { id: serviceEvent.id },
        data: {
          brakeLifecycleApplied: lifecycleApplied,
          brakeLifecycleNote: message,
        },
      });
    }

    const discCondition = this.mapBrakeComponentStatus(input.discCondition);
    const brakeFluidStatus = this.mapBrakeComponentStatus(input.brakeFluidStatus);
    const odometerKm =
      typeof input.odometerKm === 'number' && Number.isFinite(input.odometerKm)
        ? Math.round(input.odometerKm)
        : null;

    const base = {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      source: BrakeEvidenceSource.AI_UPLOAD_CONFIRMED,
      confidence: BrakeEvidenceConfidence.HIGH,
      mileageAtMeasurementKm: odometerKm,
      measuredAt: serviceDate,
      documentExtractionId: input.documentExtractionId,
      serviceEventId: serviceEvent.id,
      notes: notes ?? null,
    } satisfies Partial<BrakeEvidenceWriteInput>;

    const evidenceRows: BrakeEvidenceWriteInput[] = [
      {
        ...base,
        axle: BrakeAxle.FRONT,
        measuredPadMm: measured.frontPadMm,
        measuredDiscMm: measured.frontDiscMm,
        discCondition,
        brakeFluidStatus,
        immediateReplacement: input.immediateReplacement,
      },
      {
        ...base,
        axle: BrakeAxle.REAR,
        measuredPadMm: measured.rearPadMm,
        measuredDiscMm: measured.rearDiscMm,
      },
    ];

    const evidenceIds: string[] = [];
    for (const row of evidenceRows) {
      const created = await this.brakeEvidence.recordForDocumentExtraction(row);
      if (created?.id) {
        evidenceIds.push(created.id);
      }
    }

    return {
      serviceEventId: serviceEvent.id,
      lifecycleApplied,
      initialized,
      status,
      message,
      evidenceIds,
    };
  }

  async initializeFromRegistration(input: {
    vehicleId: string;
    brakes: RegistrationBrakeManualSpec;
    registrationMileageKm?: number | null;
    latestStateOdometerKm?: number | null;
  }): Promise<import('./brake-lifecycle.types').RecordBrakeServiceResult | null> {
    const condition = normalizeRegistrationBrakeCondition(input.brakes.condition);
    if (!shouldInitializeBrakesFromRegistration(input.brakes)) {
      return null;
    }

    const brakesForInit = applyNewBrakeDefaults(input.brakes, condition);
    const odometerKm = resolveRegistrationBrakeOdometerKm({
      brakesOdometerKm: brakesForInit.odometerKm,
      registrationMileageKm: input.registrationMileageKm,
      latestStateOdometerKm: input.latestStateOdometerKm,
      condition,
    });

    if (odometerKm == null) {
      this.logger.warn(
        `Skipping brake registration init for vehicle ${input.vehicleId}: no odometer anchor`,
      );
      return null;
    }

    const measured = registrationBrakeMeasuredSnapshot(input.brakes);
    const hasMeasured = measured != null;
    const kind: import('./brake-lifecycle.types').BrakeLifecycleKind =
      condition === 'NEW' || hasMeasured ? 'full_brake_service' : 'pads_service';

    const registrationScope = this.registrationScopeFromSpec(brakesForInit, measured);

    return this.recordService({
      vehicleId: input.vehicleId,
      serviceDate: brakesForInit.serviceDate ?? new Date().toISOString(),
      odometerKm,
      source: 'manual_registration',
      kind,
      scope: registrationScope,
      measured: measured ?? undefined,
      notes: 'Vehicle registration brake baseline (manual_registration)',
      initializeIfPossible: true,
      clientRequestId: `registration:${input.vehicleId}:${odometerKm}`,
    });
  }

  private registrationScopeFromSpec(
    brakes: RegistrationBrakeManualSpec,
    measured: ReturnType<typeof registrationBrakeMeasuredSnapshot>,
  ): BrakeLifecycleScope[] {
    if (measured) {
      return inferScopeFromMeasurements({
        frontPadMm: measured.frontPadMm ?? null,
        rearPadMm: measured.rearPadMm ?? null,
        frontDiscMm: measured.frontDiscMm ?? null,
        rearDiscMm: measured.rearDiscMm ?? null,
      }).map((c) => {
        switch (c) {
          case 'FRONT_PADS':
            return 'front_pads';
          case 'REAR_PADS':
            return 'rear_pads';
          case 'FRONT_DISCS':
            return 'front_discs';
          default:
            return 'rear_discs';
        }
      });
    }
    const out: BrakeLifecycleScope[] = [];
    if (brakes.frontPadThickness != null) out.push('front_pads');
    if (brakes.rearPadThickness != null) out.push('rear_pads');
    if (brakes.frontRotorWidth != null) out.push('front_discs');
    if (brakes.rearRotorWidth != null) out.push('rear_discs');
    return out;
  }

  private normalizeScope(scope?: BrakeLifecycleScope[]): BrakeLifecycleScope[] {
    if (!Array.isArray(scope)) return [];
    const out: BrakeLifecycleScope[] = [];
    for (const item of scope) {
      if (
        item === 'front_pads' ||
        item === 'rear_pads' ||
        item === 'front_discs' ||
        item === 'rear_discs'
      ) {
        out.push(item);
      }
    }
    return Array.from(new Set(out));
  }

  private hasMeasuredBaseline(measured: {
    frontPadMm: number | null;
    rearPadMm: number | null;
    frontDiscMm: number | null;
    rearDiscMm: number | null;
  }): boolean {
    return (
      measured.frontPadMm != null ||
      measured.rearPadMm != null ||
      measured.frontDiscMm != null ||
      measured.rearDiscMm != null
    );
  }

  private toKindEnum(
    kind?: import('./brake-lifecycle.types').BrakeLifecycleKind,
  ): BrakeServiceKind {
    if (kind === 'inspection_only') return BrakeServiceKind.INSPECTION_ONLY;
    if (kind === 'pads_service') return BrakeServiceKind.PADS_SERVICE;
    if (kind === 'discs_service') return BrakeServiceKind.DISCS_SERVICE;
    if (kind === 'brake_fluid_service') return BrakeServiceKind.BRAKE_FLUID_SERVICE;
    return BrakeServiceKind.FULL_BRAKE_SERVICE;
  }

  private mapBrakeComponentStatus(raw: string | null): BrakeComponentStatus | null {
    if (!raw) return null;
    const v = raw.trim().toLowerCase();
    if (!v) return null;
    if (['critical', 'kritisch', 'replace_now', 'defekt', 'bad'].includes(v)) {
      return BrakeComponentStatus.CRITICAL;
    }
    if (['warning', 'warn', 'worn', 'verschlissen', 'low'].includes(v)) {
      return BrakeComponentStatus.WARNING;
    }
    if (['watch', 'beobachten', 'fair'].includes(v)) {
      return BrakeComponentStatus.WATCH;
    }
    if (['good', 'gut', 'ok', 'fine'].includes(v)) {
      return BrakeComponentStatus.GOOD;
    }
    return null;
  }
}
