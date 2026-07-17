import { Injectable, Logger, Inject, forwardRef, BadRequestException } from '@nestjs/common';
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
  ServiceEventOrigin,
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
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { normalizeBatteryDocumentConfirm } from '@modules/vehicle-intelligence/battery-health/battery-document-confirmation.util';
import { InvoicesService } from '@modules/invoices/invoices.service';
import { FinesService } from '@modules/fines/fines.service';
import { ConfirmedExtractionData } from './document-extraction.types';
import {
  assessFineApplyGate,
  readAmountCents,
  readFeeBreakdown,
  readIssuingAuthority,
  readOffenseDateTimeRaw,
  readOffenseDescription,
  readOffenseType,
  readReferenceNumber,
} from './document-fine-extraction.rules';

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
 * testable service, with two product-required improvements:
 *   - damage/accident now flow through DamagesService.create() (was raw Prisma)
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
    private readonly damagesService: DamagesService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoicesService: InvoicesService,
    private readonly finesService: FinesService,
  ) {}

  async apply(input: ApplyInput): Promise<ApplyResult> {
    const { vehicleId, extractionId, documentType: docType, sourceFileUrl } = input;
    const d = input.confirmedData ?? {};

    if (docType === 'BRAKE') {
      return this.applyBrake(input, d);
    }

    if (['SERVICE', 'OIL_CHANGE', 'TUV_REPORT', 'BOKRAFT_REPORT'].includes(docType)) {
      return this.applyServiceEvent(input, d);
    }

    if (docType === 'BATTERY') {
      return this.applyBattery(input, d);
    }

    if (docType === 'TIRE' && d?.treadDepthMm && typeof d.treadDepthMm === 'object') {
      const tread = d.treadDepthMm as Record<string, unknown>;
      await this.tireLifecycleService.recordMeasurement({
        vehicleId,
        frontLeftMm: this.toNum(tread.fl),
        frontRightMm: this.toNum(tread.fr),
        rearLeftMm: this.toNum(tread.rl),
        rearRightMm: this.toNum(tread.rr),
        odometerKm: this.toNum(d?.odometerKm),
        source: 'ai_confirmed',
        linkedExtractionId: extractionId,
        linkedDocumentUrl: sourceFileUrl ?? undefined,
        quality: 'measured',
        shouldCalibrate: true,
        triggerRecalculate: true,
      });
      return {};
    }

    if (docType === 'DAMAGE' || docType === 'ACCIDENT') {
      await this.damagesService.create(vehicleId, {
        damageType: (d.damageType as any) || 'SCRATCH',
        description: typeof d.description === 'string' ? d.description : `${docType} report`,
        severity: (d.severity as any) || 'MODERATE',
        source: 'AI_UPLOAD',
      });
      return {};
    }

    if (docType === 'INVOICE') {
      return this.applyInvoice(input, d);
    }

    if (docType === 'FINE') {
      return this.applyFine(input, d);
    }

    // VEHICLE_CONDITION / OTHER: no downstream domain record is created.
    // confirmedData is preserved on the extraction itself for audit/history.
    return {};
  }

  // ── per-type apply (mirrors prior controller behaviour) ───────────────────

  private async applyBrake(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const { vehicleId, sourceFileUrl, extractionId } = input;
    const serviceDateRaw =
      (typeof d?.eventDate === 'string' && d.eventDate) ||
      (typeof d?.serviceDate === 'string' && d.serviceDate) ||
      new Date().toISOString();
    const notes =
      (typeof d?.notes === 'string' && d.notes.trim()) ||
      (typeof d?.description === 'string' && d.description.trim()) ||
      undefined;
    const kind =
      d?.serviceKind === 'inspection_only' ||
      d?.serviceKind === 'pads_service' ||
      d?.serviceKind === 'discs_service' ||
      d?.serviceKind === 'brake_fluid_service' ||
      d?.serviceKind === 'full_brake_service'
        ? d.serviceKind
        : 'full_brake_service';
    const rawScope = Array.isArray(d?.scope)
      ? d.scope
      : Array.isArray(d?.serviceScope)
        ? d.serviceScope
        : typeof d?.scopeCsv === 'string'
          ? d.scopeCsv.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
    const scope = rawScope.filter(
      (s: unknown): s is 'front_pads' | 'rear_pads' | 'front_discs' | 'rear_discs' =>
        s === 'front_pads' || s === 'rear_pads' || s === 'front_discs' || s === 'rear_discs',
    );

    const measured = (d.measured && typeof d.measured === 'object' ? d.measured : {}) as Record<string, unknown>;

    const lifecycle = await this.brakeLifecycleService.recordService({
      vehicleId,
      serviceDate: serviceDateRaw,
      odometerKm: this.toNum(d?.odometerKm),
      workshopName: (typeof d?.workshopName === 'string' && d.workshopName.trim()) || undefined,
      notes,
      source: 'ai_document',
      kind,
      scope,
      measured: {
        frontPadMm: this.toNum(d.frontPadMm ?? measured.frontPadMm),
        rearPadMm: this.toNum(d.rearPadMm ?? measured.rearPadMm),
        frontDiscMm: this.toNum(d.frontDiscMm ?? d.frontRotorWidthMm ?? measured.frontDiscMm),
        rearDiscMm: this.toNum(d.rearDiscMm ?? d.rearRotorWidthMm ?? measured.rearDiscMm),
      },
      initializeIfPossible: true,
      documentUrl: sourceFileUrl ?? undefined,
    });

    // Persist confirmed brake observations as canonical evidence. AI_UPLOAD is
    // a trusted (post-confirmation) mm source, so measured pad/disc mm values
    // are allowed; the evidence service strips any value that lacks a signal.
    const odometerKm = this.toNum(d?.odometerKm);
    const measuredAt = this.parseDate(serviceDateRaw);
    const discCondition = this.mapBrakeComponentStatus(d?.discCondition ?? d?.brakeDiscCondition);
    const brakeFluidStatus = this.mapBrakeComponentStatus(d?.brakeFluidStatus ?? d?.brakeFluid);
    const immediateReplacement = this.toBoolean(d?.immediateReplacement ?? d?.replaceNow);

    const frontPadMm = this.toNum(d.frontPadMm ?? measured.frontPadMm);
    const rearPadMm = this.toNum(d.rearPadMm ?? measured.rearPadMm);
    const frontDiscMm = this.toNum(d.frontDiscMm ?? d.frontRotorWidthMm ?? measured.frontDiscMm);
    const rearDiscMm = this.toNum(d.rearDiscMm ?? d.rearRotorWidthMm ?? measured.rearDiscMm);

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

  private async applyServiceEvent(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const { vehicleId, sourceFileUrl, documentType: docType } = input;
    const typeMap: Record<string, string> = {
      SERVICE: 'FULL_SERVICE',
      OIL_CHANGE: 'OIL_CHANGE',
      TUV_REPORT: 'TUV_INSPECTION',
      BOKRAFT_REPORT: 'BOKRAFT_INSPECTION',
    };
    const eventType = typeMap[docType] ?? 'OTHER';
    const odometerKmParsed = this.toInt(d?.odometerKm);
    const costCentsParsed = this.toInt(d?.costCents);
    const eventDate = this.dateFrom(d.eventDate);
    const svcEvent = await this.prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        eventType: eventType as any,
        eventDate: eventDate ?? new Date(),
        odometerKm: odometerKmParsed,
        workshopName: this.str(d.workshopName),
        notes: this.str(d.notes) ?? this.str(d.description),
        costCents: costCentsParsed,
        documentUrl: sourceFileUrl,
        origin: ServiceEventOrigin.AI_UPLOAD,
      },
    });

    if (docType === 'OIL_CHANGE' && eventDate) {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          lastOilChangeDate: eventDate,
          ...(odometerKmParsed != null ? { lastOilChangeOdometerKm: odometerKmParsed } : {}),
        },
      });
    }
    if (docType === 'SERVICE' && eventDate) {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          lastServiceDate: eventDate,
          ...(odometerKmParsed != null ? { lastServiceOdometerKm: odometerKmParsed } : {}),
        },
      });
    }
    if (docType === 'TUV_REPORT' && eventDate) {
      const nextTuv = new Date(eventDate);
      nextTuv.setFullYear(nextTuv.getFullYear() + 2);
      await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { lastTuvDate: eventDate, nextTuvDate: nextTuv } });
    }
    if (docType === 'BOKRAFT_REPORT' && eventDate) {
      const nextBk = new Date(eventDate);
      nextBk.setFullYear(nextBk.getFullYear() + 1);
      await this.prisma.vehicle.update({ where: { id: vehicleId }, data: { lastBokraftDate: eventDate, nextBokraftDate: nextBk } });
    }

    return { serviceEventId: svcEvent.id };
  }

  private async applyBattery(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const { vehicleId, extractionId, sourceFileUrl } = input;
    const normalized = normalizeBatteryDocumentConfirm(d as Record<string, unknown>);
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
          workshopName: this.str(d.workshopName),
          notes: this.str(d.notes) ?? this.str(d.description),
          costCents: this.toInt(d?.costCents),
          documentUrl: sourceFileUrl,
        },
      });
      serviceEventId = svcEvent.id;
    }

    const sourceType = isReplacement
      ? BatteryEvidenceSourceType.WORKSHOP_MEASUREMENT
      : BatteryEvidenceSourceType.DOCUMENT_CONFIRMED;

    const { sohPercent, voltageV, restingVoltage, crankingVoltage, chargingVoltage, temperatureC } = normalized;
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

  private async applyFine(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const { vehicleId, sourceFileUrl, extractionId } = input;
    const gate = assessFineApplyGate({
      fields: d,
      documentSubtype:
        this.str(d.documentSubtype) ??
        this.str(d.documentKind) ??
        (typeof d.noticeType === 'string' ? d.noticeType : null),
    });
    if (!gate.canApply) {
      throw new BadRequestException({
        message: 'Fine apply gate blocked — missing or invalid confirmed fields',
        blockers: gate.blockers,
        noticeType: gate.noticeType,
      });
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) return {};

    const offenseType = readOffenseType(d);
    const offenseDescription = readOffenseDescription(d);
    const breakdown = readFeeBreakdown(d);
    const descriptionParts = [offenseDescription, breakdown].filter(Boolean);
    const totalCents = readAmountCents(d) ?? 0;
    const title = offenseType ?? offenseDescription ?? 'Bußgeld aus Dokumenten-Upload';

    const fine = await this.finesService.create(vehicle.organizationId, {
      fineNumber: readReferenceNumber(d) ?? undefined,
      title,
      description: descriptionParts.join('\n\n') || offenseDescription || 'Bußgeld aus Dokumenten-Upload',
      offenseType: offenseType ?? undefined,
      issuingAuthority: readIssuingAuthority(d) ?? undefined,
      offenseDate: readOffenseDateTimeRaw(d) ?? undefined,
      location: this.str(d.location),
      amountCents: totalCents,
      currency: 'EUR',
      dueDate: this.str(d.dueDate),
      vehicleId,
      imageUrl: sourceFileUrl ?? undefined,
      extractedData: { ...d, documentExtractionId: extractionId },
      notes: breakdown ?? undefined,
    });

    return { detail: { fineId: fine.id } };
  }

  private async applyInvoice(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const { vehicleId, sourceFileUrl } = input;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (vehicle?.organizationId) {
      const orgId = vehicle.organizationId;
      const totalCentsParsed = this.toInt(d?.totalCents) ?? this.toInt(d?.costCents) ?? 0;
      const vendorNameRaw = this.str(d.vendorName) ?? this.str(d.workshopName) ?? '';
      let vendorId: string | undefined;
      if (vendorNameRaw) {
        const match = await this.prisma.vendor.findFirst({
          where: {
            organizationId: orgId,
            name: { equals: vendorNameRaw, mode: 'insensitive' },
          },
          select: { id: true },
        });
        vendorId = match?.id;
      }
      const invoiceDate =
        this.str(d.invoiceDate) ?? this.str(d.eventDate) ?? new Date().toISOString();
      await this.invoicesService.create(orgId, {
        type: 'INCOMING_UPLOADED',
        vehicleId,
        title: this.str(d.title) ?? this.str(d.invoiceTitle) ?? 'Hochgeladene Rechnung',
        description: this.str(d.description) ?? '',
        vendorId,
        vendorName: vendorNameRaw,
        totalCents: totalCentsParsed,
        invoiceDate,
        dueDate: this.str(d.dueDate),
        imageUrl: sourceFileUrl || undefined,
        extractedData: d,
        documentExtractionId: input.extractionId,
        fromExtraction: true,
        lineItems: totalCentsParsed > 0
          ? [
              {
                description: this.str(d.title) ?? 'Eingangsrechnung',
                quantity: 1,
                unitPriceNetCents: Math.round(totalCentsParsed / 1.19),
                taxRate: 19,
              },
            ]
          : undefined,
      });
    }
    return {};
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
