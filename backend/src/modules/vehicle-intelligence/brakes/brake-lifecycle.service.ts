import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BrakeServiceKind, BrakeServiceSource } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeHealthService } from './brake-health.service';

export type BrakeLifecycleKind =
  | 'inspection_only'
  | 'pads_service'
  | 'discs_service'
  | 'brake_fluid_service'
  | 'full_brake_service';

export type BrakeLifecycleSource = 'manual' | 'ai_document' | 'api';

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

    return {
      serviceEventId: serviceEvent.id,
      lifecycleApplied,
      initialized,
      status,
      message,
    };
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
    if (source === 'api') return BrakeServiceSource.API;
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
