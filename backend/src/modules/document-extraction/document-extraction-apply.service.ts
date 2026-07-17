import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  BatteryEvidenceScope,
  BatteryEvidenceSourceType,
  BatteryEvidenceValueType,
  BrakeAxle,
  BrakeComponentStatus,
  BrakeEvidenceConfidence,
  BrakeEvidenceSource,
  BrakeWheelPosition,
  DocumentExtractionType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BrakeLifecycleService } from '@modules/vehicle-intelligence/brakes/brake-lifecycle.service';
import {
  BrakeEvidenceService,
  BrakeEvidenceWriteInput,
} from '@modules/vehicle-intelligence/brakes/brake-evidence.service';
import { TireLifecycleService } from '@modules/vehicle-intelligence/tires/tire-lifecycle.service';
import {
  BatteryEvidenceService,
  BatteryEvidenceWriteInput,
} from '@modules/vehicle-intelligence/battery-health/battery-evidence.service';
import { BatteryHealthService } from '@modules/vehicle-intelligence/battery-health/battery-health.service';
import { ConfirmedExtractionData } from './document-extraction.types';
import {
  assessTireApplyGate,
  buildTireMeasurementApplyPayload,
} from './document-tire-extraction.rules';
import {
  assessBrakeApplyGate,
  buildBrakeApplyPayload,
} from './document-brake-extraction.rules';
import {
  assessBatteryApplyGate,
  buildBatteryApplyPayload,
} from './document-battery-extraction.rules';
import {
  assessArchiveApplyGate,
  buildArchiveApplyPayload,
  isArchiveDocumentType,
  type ArchiveDocumentType,
} from './document-archive-extraction.rules';

export interface ApplyInput {
  extractionId: string;
  vehicleId: string;
  documentType: DocumentExtractionType;
  sourceFileUrl: string | null;
  confirmedData: ConfirmedExtractionData;
}

export interface ApplyResult {
  serviceEventId?: string | null;
  detail?: unknown;
}

/**
 * Applies HUMAN-CONFIRMED document data to the correct vehicle domain modules.
 *
 * This is the previously-inline confirm/apply logic from
 * VehicleIntelligenceController, extracted verbatim (behaviour preserved) into a
 * testable service, with product-required improvements:
 *   - apply is invoked exactly once per extraction (idempotency is enforced by
 *     DocumentExtractionService before this service is called)
 *
 * It never applies unconfirmed extractedData — callers pass confirmedData only.
 */
@Injectable()
export class DocumentExtractionApplyService {
  private readonly logger = new Logger(DocumentExtractionApplyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brakeLifecycleService: BrakeLifecycleService,
    private readonly brakeEvidenceService: BrakeEvidenceService,
    private readonly tireLifecycleService: TireLifecycleService,
    private readonly batteryEvidenceService: BatteryEvidenceService,
    private readonly batteryHealthService: BatteryHealthService,
  ) {}

  async apply(input: ApplyInput): Promise<ApplyResult> {
    const { vehicleId, extractionId, documentType: docType, sourceFileUrl } = input;
    const d = input.confirmedData ?? {};

    if (docType === 'BRAKE') {
      return this.applyBrake(input, d);
    }

    if (['SERVICE', 'OIL_CHANGE'].includes(docType)) {
      throw new BadRequestException(
        'Service apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'TUV_REPORT' || docType === 'BOKRAFT_REPORT') {
      throw new BadRequestException(
        'Inspection apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'BATTERY') {
      return this.applyBattery(input, d);
    }

    if (docType === 'TIRE') {
      return this.applyTireReport(input, d);
    }

    if (docType === 'DAMAGE' || docType === 'ACCIDENT') {
      throw new BadRequestException(
        'Damage apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'INVOICE') {
      throw new BadRequestException(
        'Invoice apply must run through DocumentActionOrchestratorService',
      );
    }

    if (docType === 'FINE') {
      throw new BadRequestException(
        'Fine apply must run through DocumentActionOrchestratorService',
      );
    }

    if (isArchiveDocumentType(docType)) {
      return this.applyArchiveDocument(input, d, docType);
    }

    return {};
  }

  private async applyArchiveDocument(
    input: ApplyInput,
    d: Record<string, unknown>,
    docType: ArchiveDocumentType,
  ): Promise<ApplyResult> {
    const gate = assessArchiveApplyGate({ documentType: docType, fields: d });
    const payload = buildArchiveApplyPayload(d);
    if (!gate.canArchive || !payload) {
      throw new BadRequestException({
        message: 'Archive apply gate blocked — minimal metadata required',
        blockers: gate.blockers,
        archiveSubtype: gate.archiveSubtype,
      });
    }

    return {
      detail: {
        archived: true,
        archiveSubtype: payload.archiveSubtype,
        documentType: docType,
        entityLinkSuggestions: payload.entityLinkSuggestions,
        deadlineSuggestions: payload.deadlineSuggestions,
        referenceNumber: payload.referenceNumber,
        extractionId: input.extractionId,
      },
    };
  }

  // ── per-type apply (mirrors prior controller behaviour) ───────────────────

  private async applyTireReport(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const gate = assessTireApplyGate({ fields: d });
    const payload = buildTireMeasurementApplyPayload(d);
    if (!gate.canApply || !payload) {
      throw new BadRequestException({
        message: 'Tire apply gate blocked — missing or invalid confirmed fields',
        blockers: gate.blockers,
      });
    }

    const { vehicleId, extractionId, sourceFileUrl } = input;
    const treadByPosition = Object.fromEntries(
      payload.positions.map((row) => [row.position, row.treadDepthMm]),
    ) as Record<string, number | null>;

    await this.tireLifecycleService.recordMeasurement({
      vehicleId,
      frontLeftMm: treadByPosition.fl ?? undefined,
      frontRightMm: treadByPosition.fr ?? undefined,
      rearLeftMm: treadByPosition.rl ?? undefined,
      rearRightMm: treadByPosition.rr ?? undefined,
      odometerKm: payload.odometerKm ?? undefined,
      measuredAt: payload.measurementDate,
      workshopName: payload.workshopName ?? undefined,
      source: 'ai_confirmed',
      linkedExtractionId: extractionId,
      linkedDocumentUrl: sourceFileUrl ?? undefined,
      quality: 'measured',
      shouldCalibrate: true,
      triggerRecalculate: true,
    });

    return {};
  }

  private async applyBrake(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const gate = assessBrakeApplyGate({ fields: d });
    const payload = buildBrakeApplyPayload(d);
    if (!gate.canApply || !payload) {
      throw new BadRequestException({
        message: 'Brake apply gate blocked — missing or invalid confirmed fields',
        blockers: gate.blockers,
      });
    }

    const { vehicleId, sourceFileUrl, extractionId } = input;
    const serviceDateRaw = payload.measurementDate.toISOString();
    const notes = payload.notes ?? payload.workshopFinding ?? undefined;
    const kind = payload.serviceKind ?? undefined;
    const scope = payload.scope;

    const frontAxle = payload.axles.find((row) => row.axle === 'front');
    const rearAxle = payload.axles.find((row) => row.axle === 'rear');

    const lifecycle = await this.brakeLifecycleService.recordService({
      vehicleId,
      serviceDate: serviceDateRaw,
      odometerKm: payload.odometerKm ?? undefined,
      workshopName: payload.workshopName ?? undefined,
      notes,
      source: 'ai_document',
      kind,
      scope,
      measured: {
        frontPadMm: frontAxle?.padMm ?? undefined,
        rearPadMm: rearAxle?.padMm ?? undefined,
        frontDiscMm: frontAxle?.discMm ?? undefined,
        rearDiscMm: rearAxle?.discMm ?? undefined,
      },
      initializeIfPossible: true,
      documentUrl: sourceFileUrl ?? undefined,
    });

    // Persist confirmed brake observations as canonical evidence. AI_UPLOAD is
    // a trusted (post-confirmation) mm source, so measured pad/disc mm values
    // are allowed; the evidence service strips any value that lacks a signal.
    const odometerKm = payload.odometerKm;
    const measuredAt = payload.measurementDate;
    const discCondition = this.mapBrakeComponentStatus(d?.discCondition ?? d?.brakeDiscCondition);
    const brakeFluidStatus = this.mapBrakeComponentStatus(d?.brakeFluidStatus ?? d?.brakeFluid);
    const immediateReplacement = this.toBoolean(d?.immediateReplacement ?? d?.replaceNow);

    const frontPadMm = frontAxle?.padMm ?? null;
    const rearPadMm = rearAxle?.padMm ?? null;
    const frontDiscMm = frontAxle?.discMm ?? null;
    const rearDiscMm = rearAxle?.discMm ?? null;

    const base = {
      vehicleId,
      source: BrakeEvidenceSource.AI_UPLOAD,
      confidence: BrakeEvidenceConfidence.HIGH,
      mileageAtMeasurementKm: odometerKm,
      measuredAt,
      documentExtractionId: extractionId,
      serviceEventId: lifecycle.serviceEventId ?? null,
      notes,
    } satisfies Partial<BrakeEvidenceWriteInput>;

    const evidence: BrakeEvidenceWriteInput[] = [
      {
        ...base,
        axle: BrakeAxle.FRONT,
        measuredPadMm: frontPadMm,
        measuredDiscMm: frontDiscMm,
        // System-level safety signals are attached to the front-axle row so the
        // read model and detectors can resolve them regardless of axle filter.
        discCondition,
        brakeFluidStatus,
        immediateReplacement,
      },
      {
        ...base,
        axle: BrakeAxle.REAR,
        measuredPadMm: rearPadMm,
        measuredDiscMm: rearDiscMm,
      },
    ];

    await this.brakeEvidenceService.recordMany(evidence);

    return { serviceEventId: lifecycle.serviceEventId, detail: lifecycle };
  }

  private mapBrakeComponentStatus(
    raw: unknown,
  ): BrakeComponentStatus | null {
    if (typeof raw !== 'string') return null;
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

  private toBoolean(raw: unknown): boolean | null {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const v = raw.trim().toLowerCase();
      if (['yes', 'true', 'ja', '1', 'sofort'].includes(v)) return true;
      if (['no', 'false', 'nein', '0'].includes(v)) return false;
    }
    return null;
  }

  private parseDate(raw: unknown): Date | null {
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    if (typeof raw === 'string' && raw.trim()) {
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  private async applyBattery(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const gate = assessBatteryApplyGate({ fields: d });
    const normalized = buildBatteryApplyPayload(d);
    if (!gate.canApply || !normalized) {
      throw new BadRequestException({
        message: 'Battery apply gate blocked — missing or invalid confirmed fields',
        blockers: gate.blockers,
      });
    }

    const { vehicleId, extractionId, sourceFileUrl } = input;
    const observedAt = normalized.observedAt;
    const scope = normalized.scope;
    const isReplacement = normalized.isReplacement;

    let serviceEventId: string | null = null;
    if (isReplacement) {
      const svcEvent = await this.prisma.vehicleServiceEvent.create({
        data: {
          vehicleId,
          eventType: 'BATTERY_REPLACEMENT',
          eventDate: observedAt,
          odometerKm: normalized.odometerKm != null ? Math.round(normalized.odometerKm) : undefined,
          workshopName: normalized.workshopName ?? this.str(d.workshopName),
          notes: normalized.notes ?? this.str(d.notes) ?? this.str(d.description),
          costCents: this.toInt(d?.costCents),
          documentUrl: sourceFileUrl,
        },
      });
      serviceEventId = svcEvent.id;
    }

    const sourceType = isReplacement
      ? BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT
      : BatteryEvidenceSourceType.DOCUMENT_CONFIRMED;

    const { sohPercent, voltageV, restingVoltage, crankingVoltage, chargingVoltage, temperatureC } =
      normalized;
    const isLv = scope === BatteryEvidenceScope.LV;
    const quality = isReplacement ? 'workshop_measurement' : 'document_confirmed';

    const base = (valueType: BatteryEvidenceValueType, numericValue: number | null | undefined, unit: string): BatteryEvidenceWriteInput => ({
      vehicleId,
      scope,
      sourceType,
      valueType,
      numericValue,
      unit,
      observedAt,
      provider: 'document_confirmed',
      confidence: 'document_confirmed',
      quality,
      documentExtractionId: extractionId,
      serviceEventId,
    });

    const evidenceEntries: BatteryEvidenceWriteInput[] = [
      base(BatteryEvidenceValueType.SOH_PERCENT, sohPercent, 'percent'),
      base(BatteryEvidenceValueType.VOLTAGE_V, voltageV, 'V'),
      base(BatteryEvidenceValueType.BATTERY_TEMPERATURE_C, temperatureC, 'celsius'),
    ];

    if (isLv) {
      evidenceEntries.push(
        base(BatteryEvidenceValueType.RESTING_VOLTAGE_V, restingVoltage, 'V'),
        base(BatteryEvidenceValueType.CRANKING_VOLTAGE_V, crankingVoltage, 'V'),
        base(BatteryEvidenceValueType.CHARGING_VOLTAGE_V, chargingVoltage, 'V'),
      );
    }

    await this.batteryEvidenceService.recordMany(evidenceEntries);

    if (isLv && (voltageV != null || restingVoltage != null)) {
      const lvReferenceVoltage = restingVoltage ?? voltageV;
      if (lvReferenceVoltage != null) {
        await this.batteryHealthService.recordSnapshot({
          vehicleId,
          voltageV: lvReferenceVoltage,
          temperatureC: temperatureC ?? undefined,
          restingVoltage: restingVoltage ?? undefined,
          crankingVoltage: crankingVoltage ?? undefined,
          chargingVoltage: chargingVoltage ?? undefined,
          observedAt,
          sourceType,
          provider: 'document_confirmed',
          quality,
          documentExtractionId: extractionId,
          serviceEventId: serviceEventId ?? undefined,
        });
      }
    }

    return { serviceEventId };
  }

  // ── locale-aware numeric parsing (matches prior controller helpers) ───────

  private toNum(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const parsed = Number(v.trim().replace(',', '.'));
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private toInt(v: unknown): number | undefined {
    const n = this.toNum(v);
    return n != null ? Math.round(n) : undefined;
  }

  private str(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  }

  private dateFrom(v: unknown): Date | undefined {
    if (v instanceof Date) return v;
    if (typeof v === 'string' || typeof v === 'number') {
      const parsed = new Date(v);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    return undefined;
  }
}
