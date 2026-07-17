import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  BrakeAxle,
  BrakeComponentInstallationAnchorSource,
  BrakeComponentInstallationType,
  BrakeEvidenceConfidence,
  BrakeEvidenceSource,
  BrakeServiceKind,
  BrakeServiceSource,
  ServiceEventOrigin,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeEvidenceService, BrakeEvidenceWriteInput } from './brake-evidence.service';
import { BrakeHealthService } from './brake-health.service';
import { thicknessFieldForComponent } from './brake-component-lifecycle.scope';
import {
  componentToScopeToken,
  inferScopeFromMeasurements,
  resolveServiceComponentScope,
  serviceKindAllowsReplacement,
  serviceKindIsHistoryOnly,
  type BrakeMeasuredSnapshot,
} from './brake-service-scope.matrix';
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

    let resolvedComponents: BrakeComponentInstallationType[] = [];
    let scopeProfile = 'INSPECTION_ONLY';

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
          scope,
          measured,
          allowMeasurementInference: true,
        });
        resolvedComponents = resolved.components;
        scopeProfile = resolved.profile;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'invalid_service_scope';
        throw new BadRequestException(message);
      }
    }

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
        brakeServiceScope:
          resolvedComponents.length > 0
            ? resolvedComponents.map(componentToScopeToken)
            : scope.length > 0
              ? scope
              : undefined,
        brakeMeasuredSnapshot: hasMeasuredBaseline ? measured : undefined,
        origin: source === BrakeServiceSource.AI_DOCUMENT ? ServiceEventOrigin.AI_UPLOAD : ServiceEventOrigin.MANUAL,
      },
    });

    let initialized = false;
    let lifecycleApplied = false;
    let status: RecordBrakeServiceResult['status'] = 'history_only';
    let message = 'Brake service history logged. No measured thickness baseline was applied.';
    let evidenceWarning: string | null = null;

    const shouldApplyHealth =
      input.initializeIfPossible !== false &&
      (resolvedComponents.length > 0 || (hasMeasuredBaseline && serviceKindAllowsReplacement(kind)));

    if (shouldApplyHealth) {
      try {
        if (resolvedComponents.length > 0) {
          const init = await this.applyScopedReplacement(input.vehicleId, {
            serviceDate,
            odometerKm: input.odometerKm,
            components: resolvedComponents,
            measured,
            profile: scopeProfile,
          });
          initialized = init.initialized;
          lifecycleApplied = init.initialized;
          status = init.initialized ? 'initialized' : 'history_only';
          message = init.message;
        } else if (hasMeasuredBaseline) {
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
            init?.message ?? 'Brake health baseline initialized from measured service data.';
        }
      } catch (err: any) {
        const errMsg = err?.message || 'Baseline initialization failed';
        this.logger.warn(
          `Brake lifecycle initialize failed for vehicle ${input.vehicleId}: ${errMsg}`,
        );
        message = `Brake service history logged, but baseline initialization failed: ${errMsg}`;
      }
    } else if (serviceKindIsHistoryOnly(kind)) {
      message =
        kind === BrakeServiceKind.INSPECTION_ONLY
          ? 'Brake inspection recorded. Wear anchors were not changed.'
          : 'Brake fluid service recorded. Pad/disc wear anchors were not changed.';
    }

    await this.prisma.vehicleServiceEvent.update({
      where: { id: serviceEvent.id },
      data: {
        brakeLifecycleApplied: lifecycleApplied,
        brakeLifecycleNote: message,
      },
    });

    if (hasMeasuredBaseline && input.source !== 'ai_document') {
      try {
        await this.recordMeasuredEvidence(
          input,
          serviceEvent.id,
          measured,
          serviceDate,
          resolvedComponents,
          kind,
        );
      } catch (err: any) {
        this.logger.warn(
          `Brake evidence write failed for vehicle ${input.vehicleId}: ${err?.message ?? err}`,
        );
        evidenceWarning =
          'Messkette unvollständig: BrakeHealth wurde aktualisiert, aber BrakeEvidence konnte nicht geschrieben werden.';
        if (initialized) {
          await this.appendBaselineWarning(input.vehicleId, evidenceWarning);
        }
      }
    }

    return {
      serviceEventId: serviceEvent.id,
      lifecycleApplied,
      initialized,
      status,
      message: evidenceWarning ? `${message} ${evidenceWarning}` : message,
    };
  }

  /**
   * Canonical registration write-path: records a BRAKE_SERVICE event and
   * initializes BrakeHealthCurrent via scoped replacement — never writes
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

    const measured = registrationBrakeMeasuredSnapshot(input.brakes);
    const hasMeasured = measured != null;
    const kind: BrakeLifecycleKind =
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
    });
  }

  private async applyScopedReplacement(
    vehicleId: string,
    input: {
      serviceDate: Date;
      odometerKm?: number;
      components: BrakeComponentInstallationType[];
      measured: BrakeMeasuredSnapshot;
      profile: string;
    },
  ): Promise<{ initialized: boolean; message: string }> {
    const specs = await this.prisma.vehicleBrakeReferenceSpec.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    const spec = specs[0];

    const latestState = await this.prisma.vehicleLatestState.findUnique({
      where: { vehicleId },
      select: { odometerKm: true },
    });
    const odo =
      typeof input.odometerKm === 'number' && Number.isFinite(input.odometerKm)
        ? Math.round(input.odometerKm)
        : latestState?.odometerKm ?? null;

    const anchors = input.components
      .map((componentType) => {
        const field = thicknessFieldForComponent(componentType);
        const measuredMm = input.measured[field];
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

    if (anchors.length === 0) {
      return {
        initialized: false,
        message:
          'Brake service history recorded. No scoped component baseline was available (missing measurement and reference spec).',
      };
    }

    if (odo == null) {
      return {
        initialized: false,
        message:
          'Brake service history recorded. Scoped replacement requires an odometer anchor.',
      };
    }

    const anyMeasured = anchors.some(
      (a) => a.anchorSource === BrakeComponentInstallationAnchorSource.MEASURED,
    );
    const baselineWarnings: string[] = [];
    if (!anyMeasured) {
      baselineWarnings.push(
        'Using nominal reference-spec baseline (estimated). Add measured thickness at next inspection to improve confidence.',
      );
    }

    const existing = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!existing) {
      const init = await this.brakeHealth.initializeFromService(
        vehicleId,
        {
          serviceDate: input.serviceDate.toISOString(),
          odometerKm: odo,
          frontPadMm: input.measured.frontPadMm ?? undefined,
          rearPadMm: input.measured.rearPadMm ?? undefined,
          frontRotorWidthMm: input.measured.frontDiscMm ?? undefined,
          rearRotorWidthMm: input.measured.rearDiscMm ?? undefined,
        },
        { scopedComponents: input.components },
      );
      return {
        initialized: init?.initialized === true,
        message:
          init?.message ?? 'Brake health baseline initialized from scoped service data.',
      };
    }

    const result = await this.brakeHealth.applyScopedComponentAnchors(vehicleId, {
      serviceDate: input.serviceDate,
      odometerKm: odo,
      components: anchors,
      resetWearCalibration: false,
      baselineWarnings: [
        ...this.readWarningArray(existing.baselineWarnings),
        ...baselineWarnings,
      ],
    });

    return {
      initialized: result.updated,
      message: anyMeasured
        ? 'Brake health updated for scoped component replacement (measured).'
        : 'Brake health updated for scoped component replacement (reference-spec fallback).',
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
      }).map((c) => componentToScopeToken(c) as BrakeLifecycleScope);
    }
    const out: BrakeLifecycleScope[] = [];
    if (brakes.frontPadThickness != null) out.push('front_pads');
    if (brakes.rearPadThickness != null) out.push('rear_pads');
    if (brakes.frontRotorWidth != null) out.push('front_discs');
    if (brakes.rearRotorWidth != null) out.push('rear_discs');
    return out;
  }

  private async appendBaselineWarning(vehicleId: string, warning: string): Promise<void> {
    const current = await this.prisma.brakeHealthCurrent.findUnique({ where: { vehicleId } });
    if (!current) return;
    const warnings = this.readWarningArray(current.baselineWarnings);
    if (!warnings.includes(warning)) warnings.push(warning);
    await this.prisma.brakeHealthCurrent.update({
      where: { vehicleId },
      data: { baselineWarnings: warnings },
    });
  }

  private readWarningArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }

  private async recordMeasuredEvidence(
    input: RecordBrakeServiceInput,
    serviceEventId: string,
    measured: BrakeMeasuredSnapshot,
    serviceDate: Date,
    scopedComponents: BrakeComponentInstallationType[],
    kind: BrakeServiceKind,
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

    const includeFront =
      serviceKindIsHistoryOnly(kind) ||
      scopedComponents.includes(BrakeComponentInstallationType.FRONT_PADS) ||
      scopedComponents.includes(BrakeComponentInstallationType.FRONT_DISCS);
    const includeRear =
      serviceKindIsHistoryOnly(kind) ||
      scopedComponents.includes(BrakeComponentInstallationType.REAR_PADS) ||
      scopedComponents.includes(BrakeComponentInstallationType.REAR_DISCS);

    const rows: BrakeEvidenceWriteInput[] = [];
    if (
      includeFront &&
      (measured.frontPadMm != null || measured.frontDiscMm != null)
    ) {
      rows.push({
        ...base,
        axle: BrakeAxle.FRONT,
        measuredPadMm: measured.frontPadMm,
        measuredDiscMm: measured.frontDiscMm,
      });
    }
    if (
      includeRear &&
      (measured.rearPadMm != null || measured.rearDiscMm != null)
    ) {
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
  ): BrakeMeasuredSnapshot {
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

  private normalizePositive(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value <= 0) return null;
    return Math.round(value * 100) / 100;
  }

  private hasMeasuredBaseline(measured: BrakeMeasuredSnapshot): boolean {
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
}
