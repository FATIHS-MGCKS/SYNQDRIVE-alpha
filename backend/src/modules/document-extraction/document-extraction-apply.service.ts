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
import { InvoicesService } from '@modules/invoices/invoices.service';
import { FinesService } from '@modules/fines/fines.service';
import { ConfirmedExtractionData } from './document-extraction.types';
import {
  assessInspectionApplyGate,
  buildInspectionServiceEventNotes,
  buildInspectionVehicleComplianceUpdate,
  INSPECTION_DOCUMENT_TYPES,
  readInspectionDate,
  readIssuingOrganization,
  readMileageKm,
  type InspectionDocumentType,
} from './document-inspection-extraction.rules';
import {
  assessInvoiceApplyGate,
  buildInvoiceApplyLineItems,
  readInvoiceDate,
  readSupplier,
  resolveInvoiceApplyTotals,
} from './document-invoice-extraction.rules';
import {
  assessDamageApplyGate,
  buildDamageCreatePayload,
  findDuplicateDamageCandidate,
  readDamageAreas,
  type DamageDocumentType,
} from './document-damage-extraction.rules';
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

    if (['SERVICE', 'OIL_CHANGE'].includes(docType)) {
      return this.applyServiceEvent(input, d);
    }

    if (docType === 'TUV_REPORT' || docType === 'BOKRAFT_REPORT') {
      return this.applyInspectionReport(input, d, docType);
    }

    if (docType === 'BATTERY') {
      return this.applyBattery(input, d);
    }

    if (docType === 'TIRE') {
      return this.applyTireReport(input, d);
    }

    if (docType === 'DAMAGE' || docType === 'ACCIDENT') {
      return this.applyDamageReport(input, d, docType);
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

    return { serviceEventId: svcEvent.id };
  }

  private async applyInspectionReport(
    input: ApplyInput,
    d: Record<string, unknown>,
    docType: InspectionDocumentType,
  ): Promise<ApplyResult> {
    const gate = assessInspectionApplyGate({
      documentType: docType,
      fields: d,
    });
    if (!gate.canArchive) {
      throw new BadRequestException({
        message: 'Inspection apply gate blocked — invalid confirmed fields',
        blockers: gate.blockers,
      });
    }

    const { vehicleId, sourceFileUrl } = input;
    const eventType =
      docType === INSPECTION_DOCUMENT_TYPES.TUV ? 'TUV_INSPECTION' : 'BOKRAFT_INSPECTION';
    const eventDate = this.dateFrom(readInspectionDate(d));
    const odometerKmParsed = this.toInt(readMileageKm(d));
    const svcEvent = await this.prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        eventType: eventType as any,
        eventDate: eventDate ?? new Date(),
        odometerKm: odometerKmParsed,
        workshopName: readIssuingOrganization(d) ?? undefined,
        notes: buildInspectionServiceEventNotes(d),
        documentUrl: sourceFileUrl,
        origin: ServiceEventOrigin.AI_UPLOAD,
      },
    });

    const complianceUpdate = buildInspectionVehicleComplianceUpdate(docType, d);
    if (gate.canUpdateVehicleMasterData && complianceUpdate) {
      if (docType === INSPECTION_DOCUMENT_TYPES.TUV) {
        await this.prisma.vehicle.update({
          where: { id: vehicleId },
          data: {
            lastTuvDate: complianceUpdate.lastInspectionDate,
            nextTuvDate: complianceUpdate.nextValidUntilDate,
          },
        });
      } else {
        await this.prisma.vehicle.update({
          where: { id: vehicleId },
          data: {
            lastBokraftDate: complianceUpdate.lastInspectionDate,
            nextBokraftDate: complianceUpdate.nextValidUntilDate,
          },
        });
      }
    }

    return { serviceEventId: svcEvent.id };
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

  private async applyFine(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const { vehicleId, sourceFileUrl, extractionId } = input;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) return {};

    const offenseType = this.str(d.offenseType) ?? 'Parkverstoß';
    const summary = this.str(d.description);
    const breakdown = this.str(d.feeBreakdown);
    const descriptionParts = [summary, breakdown].filter(Boolean);
    const totalCents = this.toInt(d.totalCents) ?? 0;

    const fine = await this.finesService.create(vehicle.organizationId, {
      fineNumber: this.str(d.reportNumber),
      title: offenseType,
      description: descriptionParts.join('\n\n') || 'Bußgeld aus Dokumenten-Upload',
      offenseType,
      issuingAuthority: this.str(d.issuingAuthority),
      offenseDate: this.str(d.eventDate),
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

  private async applyDamageReport(
    input: ApplyInput,
    d: Record<string, unknown>,
    docType: DamageDocumentType,
  ): Promise<ApplyResult> {
    const { vehicleId } = input;
    const candidateAreas = readDamageAreas(d);
    const payload = buildDamageCreatePayload(d);

    const existingDamages = await this.prisma.vehicleDamage.findMany({
      where: { vehicleId },
      select: {
        id: true,
        damageType: true,
        severity: true,
        description: true,
        locationLabel: true,
        createdAt: true,
      },
    });

    const duplicate =
      payload != null
        ? findDuplicateDamageCandidate(existingDamages, payload, candidateAreas)
        : null;

    const gate = assessDamageApplyGate({
      documentType: docType,
      fields: d,
      duplicateDamageId: duplicate?.id ?? null,
    });

    if (!gate.canApply || !payload) {
      throw new BadRequestException({
        message: 'Damage apply gate blocked — missing or invalid confirmed fields',
        blockers: gate.blockers,
        documentMode: gate.documentMode,
      });
    }

    const damage = await this.damagesService.create(vehicleId, {
      damageType: payload.damageType,
      severity: payload.severity,
      description: payload.description,
      locationLabel: payload.locationLabel ?? undefined,
      estimatedCostCents: payload.estimatedCostCents ?? undefined,
      bookingId: payload.bookingId ?? undefined,
      liabilityNote: payload.liabilityNote ?? undefined,
      source: 'AI_UPLOAD',
    });

    return { detail: { damageId: damage.id } };
  }

  private async applyInvoice(input: ApplyInput, d: Record<string, unknown>): Promise<ApplyResult> {
    const gate = assessInvoiceApplyGate({
      fields: d,
      documentSubtype:
        this.str(d.documentSubtype) ??
        this.str(d.documentKind) ??
        null,
    });
    if (!gate.canApply) {
      throw new BadRequestException({
        message: 'Invoice apply gate blocked — missing or invalid confirmed fields',
        blockers: gate.blockers,
        isCreditNote: gate.isCreditNote,
      });
    }

    const { vehicleId, sourceFileUrl } = input;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (vehicle?.organizationId) {
      const orgId = vehicle.organizationId;
      const { totalCents: totalCentsParsed, currency } = resolveInvoiceApplyTotals(d);
      const vendorNameRaw = readSupplier(d) ?? '';
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
      const invoiceDate = readInvoiceDate(d) ?? new Date().toISOString();
      const lineItems = buildInvoiceApplyLineItems(d);
      await this.invoicesService.create(orgId, {
        type: 'INCOMING_UPLOADED',
        vehicleId,
        title: this.str(d.title) ?? this.str(d.invoiceTitle) ?? 'Hochgeladene Rechnung',
        description: this.str(d.description) ?? '',
        vendorId,
        vendorName: vendorNameRaw,
        totalCents: Math.abs(totalCentsParsed),
        currency: currency ?? undefined,
        invoiceDate,
        dueDate: this.str(d.dueDate),
        imageUrl: sourceFileUrl || undefined,
        extractedData: d,
        documentExtractionId: input.extractionId,
        fromExtraction: true,
        lineItems,
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
