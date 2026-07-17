import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
import { BrakeEvidenceService, BrakeEvidenceWriteInput } from './brake-evidence.service';
import { BrakeHealthService } from './brake-health.service';
import {
  applyNewBrakeDefaults,
  normalizeRegistrationBrakeCondition,
  type RegistrationBrakeManualSpec,
  registrationBrakeMeasuredSnapshot,
  resolveRegistrationBrakeOdometerKm,
  shouldInitializeBrakesFromRegistration,
} from './register-brake-baseline';

export type BrakeLifecycleKind =
  | 'inspection_only'
  | 'pads_service'
  | 'discs_service'
  | 'brake_fluid_service'
  | 'full_brake_service';

export type BrakeLifecycleSource = 'manual' | 'ai_document' | 'api' | 'manual_registration';

export type BrakeLifecycleScope =
  | 'front_pads'
  | 'rear_pads'
  | 'front_discs'
  | 'rear_discs';

export interface RecordBrakeServiceInput {
  vehicleId: string;
  serviceDate: string;
  odometerKm?: number;
  workshopName?: string;
  notes?: string;
  documentUrl?: string;
  source?: BrakeLifecycleSource;
  kind?: BrakeLifecycleKind;
  scope?: BrakeLifecycleScope[];
  measured?: {
    frontPadMm?: number;
    rearPadMm?: number;
    frontDiscMm?: number;
    rearDiscMm?: number;
  };
  initializeIfPossible?: boolean;
}

export interface RecordBrakeServiceResult {
  serviceEventId: string;
  lifecycleApplied: boolean;
  initialized: boolean;
  status: 'initialized' | 'history_only';
  message: string;
}

export type ApplyBrakeFromDocumentExtractionInput = {
  organizationId: string;
  vehicleId: string;
  documentExtractionId: string;
  documentActionIdempotencyKey?: string | null;
  measurementDate: Date;
  serviceKind: BrakeLifecycleKind | null;
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

export type ApplyBrakeFromDocumentExtractionResult = RecordBrakeServiceResult & {
  evidenceIds: string[];
};

@Injectable()
export class BrakeLifecycleService {
  private readonly logger = new Logger(BrakeLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeHealth: BrakeHealthService,
    private readonly brakeEvidence: BrakeEvidenceService,
  ) {}

  async recordService(input: RecordBrakeServiceInput): Promise<RecordBrakeServiceResult> {
    if (!input.vehicleId) {
      throw new BadRequestException('vehicleId is required');
    }

    const serviceDate = new Date(input.serviceDate);
    if (Number.isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid serviceDate');
    }

    const measured = this.normalizeMeasured(input.measured);
    const hasMeasuredBaseline = this.hasMeasuredBaseline(measured);
    const source = this.toSourceEnum(input.source);
    const kind = this.toKindEnum(input.kind);
    const scope = this.normalizeScope(input.scope);
    const allowsSpecFallback =
      kind === BrakeServiceKind.PADS_SERVICE ||
      kind === BrakeServiceKind.DISCS_SERVICE ||
      kind === BrakeServiceKind.FULL_BRAKE_SERVICE;

    const serviceEvent = await this.prisma.vehicleServiceEvent.create({
      data: {
        vehicleId: input.vehicleId,
        eventType: 'BRAKE_SERVICE',
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
        brakeMeasuredSnapshot: hasMeasuredBaseline ? measured : undefined,
        origin: source === BrakeServiceSource.AI_DOCUMENT ? ServiceEventOrigin.AI_UPLOAD : ServiceEventOrigin.MANUAL,
      },
    });

    let initialized = false;
    let lifecycleApplied = false;
    let status: RecordBrakeServiceResult['status'] = 'history_only';
    let message = 'Brake service history logged. No measured thickness baseline was applied.';

    if ((hasMeasuredBaseline || allowsSpecFallback) && input.initializeIfPossible !== false) {
      try {
        const init = await this.brakeHealth.initializeFromService(input.vehicleId, {
          serviceDate: serviceDate.toISOString(),
          odometerKm: input.odometerKm,
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
      } catch (err: any) {
        const errMsg = err?.message || 'Baseline initialization failed';
        this.logger.warn(
          `Brake lifecycle initialize failed for vehicle ${input.vehicleId}: ${errMsg}`,
        );
        message = `Brake service history logged, but baseline initialization failed: ${errMsg}`;
      }
    }

    await this.prisma.vehicleServiceEvent.update({
      where: { id: serviceEvent.id },
      data: {
        brakeLifecycleApplied: lifecycleApplied,
        brakeLifecycleNote: message,
      },
    });

    // Manual/API services with confirmed measurements become canonical BrakeEvidence.
    // AI document uploads record evidence in document-extraction-apply (post-confirmation).
    if (hasMeasuredBaseline && input.source !== 'ai_document') {
      try {
        await this.recordMeasuredEvidence(input, serviceEvent.id, measured, serviceDate);
      } catch (err: any) {
        this.logger.warn(
          `Brake evidence write failed for vehicle ${input.vehicleId}: ${err?.message ?? err}`,
        );
      }
    }

    return {
      serviceEventId: serviceEvent.id,
      lifecycleApplied,
      initialized,
      status,
      message,
    };
  }

  async applyFromDocumentExtraction(
    input: ApplyBrakeFromDocumentExtractionInput,
  ): Promise<ApplyBrakeFromDocumentExtractionResult> {
    if (!input.documentExtractionId) {
      throw new BadRequestException('documentExtractionId is required for extraction apply');
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
    let status: RecordBrakeServiceResult['status'] =
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
      vehicleId: input.vehicleId,
      source: BrakeEvidenceSource.AI_UPLOAD,
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

  /**
   * Canonical registration write-path: records a BRAKE_SERVICE event and
   * initializes BrakeHealthCurrent via initializeFromService — never writes
   * brake health rows directly from VehiclesService.
   */
  async initializeFromRegistration(input: {
    vehicleId: string;
    brakes: RegistrationBrakeManualSpec;
    registrationMileageKm?: number | null;
    latestStateOdometerKm?: number | null;
  }): Promise<RecordBrakeServiceResult | null> {
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

    // Only user-submitted mm values become measured evidence — NEW defaults stay spec-only.
    const measured = registrationBrakeMeasuredSnapshot(input.brakes);
    const hasMeasured = measured != null;
    const kind: BrakeLifecycleKind =
      condition === 'NEW' || hasMeasured ? 'full_brake_service' : 'pads_service';

    return this.recordService({
      vehicleId: input.vehicleId,
      serviceDate: brakesForInit.serviceDate ?? new Date().toISOString(),
      odometerKm,
      source: 'manual_registration',
      kind,
      measured,
      notes: 'Vehicle registration brake baseline (manual_registration)',
      initializeIfPossible: true,
    });
  }

  private async recordMeasuredEvidence(
    input: RecordBrakeServiceInput,
    serviceEventId: string,
    measured: {
      frontPadMm: number | null;
      rearPadMm: number | null;
      frontDiscMm: number | null;
      rearDiscMm: number | null;
    },
    serviceDate: Date,
  ): Promise<void> {
    const odometerKm =
      typeof input.odometerKm === 'number' && Number.isFinite(input.odometerKm)
        ? Math.round(input.odometerKm)
        : null;
    const evidenceSource =
      input.source === 'api' || input.source === 'manual_registration'
        ? BrakeEvidenceSource.MANUAL_MEASUREMENT
        : BrakeEvidenceSource.WORKSHOP_REPORT;

    const base = {
      vehicleId: input.vehicleId,
      source: evidenceSource,
      confidence: BrakeEvidenceConfidence.HIGH,
      mileageAtMeasurementKm: odometerKm,
      measuredAt: serviceDate,
      serviceEventId,
      notes: input.notes?.trim() || null,
    } satisfies Partial<BrakeEvidenceWriteInput>;

    const rows: BrakeEvidenceWriteInput[] = [];
    if (measured.frontPadMm != null || measured.frontDiscMm != null) {
      rows.push({
        ...base,
        axle: BrakeAxle.FRONT,
        measuredPadMm: measured.frontPadMm,
        measuredDiscMm: measured.frontDiscMm,
      });
    }
    if (measured.rearPadMm != null || measured.rearDiscMm != null) {
      rows.push({
        ...base,
        axle: BrakeAxle.REAR,
        measuredPadMm: measured.rearPadMm,
        measuredDiscMm: measured.rearDiscMm,
      });
    }
    if (rows.length > 0) {
      await this.brakeEvidence.recordMany(rows);
    }
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

  private normalizeMeasured(
    measured?: RecordBrakeServiceInput['measured'],
  ): {
    frontPadMm: number | null;
    rearPadMm: number | null;
    frontDiscMm: number | null;
    rearDiscMm: number | null;
  } {
    const toNum = (v: unknown): number | null => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      if (v <= 0) return null;
      return Math.round(v * 100) / 100;
    };
    return {
      frontPadMm: toNum(measured?.frontPadMm),
      rearPadMm: toNum(measured?.rearPadMm),
      frontDiscMm: toNum(measured?.frontDiscMm),
      rearDiscMm: toNum(measured?.rearDiscMm),
    };
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

  private toSourceEnum(source?: BrakeLifecycleSource): BrakeServiceSource {
    if (source === 'ai_document') return BrakeServiceSource.AI_DOCUMENT;
    if (source === 'api' || source === 'manual_registration') return BrakeServiceSource.API;
    return BrakeServiceSource.MANUAL;
  }

  private toKindEnum(kind?: BrakeLifecycleKind): BrakeServiceKind {
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
