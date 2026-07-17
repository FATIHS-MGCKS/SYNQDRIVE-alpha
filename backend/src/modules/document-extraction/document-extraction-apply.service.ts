import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
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
import type { DocumentApplyTypedResult } from './document-extraction-apply-result.types';
import {
  createApplyFailure,
  createApplySuccess,
} from './document-extraction-apply-result.util';
import {
  dateFrom,
  int,
  isApplyFailure,
  num,
  requireEventDate,
  requirePositiveInt,
  requireStr,
  str,
} from './document-extraction-apply-field.util';

export interface ApplyInput {
  extractionId: string;
  vehicleId: string;
  documentType: DocumentExtractionType;
  sourceFileUrl: string | null;
  confirmedData: ConfirmedExtractionData;
}

/** @deprecated Use DocumentApplyTypedResult — kept as alias for transitional imports. */
export type ApplyResult = DocumentApplyTypedResult;

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

  async apply(input: ApplyInput): Promise<DocumentApplyTypedResult> {
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

    if (docType === 'TIRE') {
      if (!d?.treadDepthMm || typeof d.treadDepthMm !== 'object') {
        return createApplyFailure(['TIRE_MEASUREMENT_REQUIRED']);
      }
      const tread = d.treadDepthMm as Record<string, unknown>;
      const { measurement } = await this.tireLifecycleService.recordMeasurement({
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
      if (!measurement?.id) {
        return createApplyFailure(['TIRE_MEASUREMENT_NOT_PERSISTED']);
      }
      return createApplySuccess({
        downstreamEntityType: 'tire_measurement',
        downstreamEntityId: measurement.id,
        actionCount: 1,
        detail: { measurementId: measurement.id },
      });
    }

    if (docType === 'DAMAGE' || docType === 'ACCIDENT') {
      const damageType = requireStr(d.damageType, 'DAMAGE_TYPE_REQUIRED');
      if (isApplyFailure(damageType)) return damageType;
      const severity = requireStr(d.severity, 'DAMAGE_SEVERITY_REQUIRED');
      if (isApplyFailure(severity)) return severity;
      const description = str(d.description);
      const damageArea = str(d.damageArea);
      if (!description && !damageArea) {
        return createApplyFailure(['DAMAGE_DESCRIPTION_OR_AREA_REQUIRED']);
      }
      const damage = await this.damagesService.create(vehicleId, {
        damageType: damageType as any,
        description: description ?? damageArea!,
        severity: severity as any,
        source: 'AI_UPLOAD',
      });
      if (!damage?.id) {
        return createApplyFailure(['DAMAGE_NOT_PERSISTED']);
      }
      return createApplySuccess({
        downstreamEntityType: 'damage',
        downstreamEntityId: damage.id,
        actionCount: 1,
        detail: { damageId: damage.id },
      });
    }

    if (docType === 'INVOICE') {
      return this.applyInvoice(input, d);
    }

    if (docType === 'FINE') {
      return this.applyFine(input, d);
    }

    // VEHICLE_CONDITION / OTHER: archive-only — apply must not be invoked directly.
    return createApplyFailure(['ARCHIVE_ONLY_NO_DOWNSTREAM_APPLY']);
  }

  // ── per-type apply (mirrors prior controller behaviour) ───────────────────

  private async applyBrake(input: ApplyInput, d: Record<string, unknown>): Promise<DocumentApplyTypedResult> {
    const { vehicleId, sourceFileUrl, extractionId } = input;
    const serviceDateRaw = requireEventDate(d);
    if (isApplyFailure(serviceDateRaw)) return serviceDateRaw;
    const notes =
      str(d.notes) ??
      str(d.description);
    const kind =
      d?.serviceKind === 'inspection_only' ||
      d?.serviceKind === 'pads_service' ||
      d?.serviceKind === 'discs_service' ||
      d?.serviceKind === 'brake_fluid_service' ||
      d?.serviceKind === 'full_brake_service'
        ? d.serviceKind
        : null;
    if (!kind) {
      return createApplyFailure(['BRAKE_SERVICE_KIND_REQUIRED']);
    }
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
      odometerKm: num(d?.odometerKm),
      workshopName: str(d?.workshopName),
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

    if (!lifecycle.serviceEventId) {
      return createApplyFailure(['BRAKE_SERVICE_EVENT_NOT_CREATED'], lifecycle);
    }

    return createApplySuccess({
      downstreamEntityType: 'brake_service',
      downstreamEntityId: lifecycle.serviceEventId,
      actionCount: 2,
      serviceEventId: lifecycle.serviceEventId,
      detail: lifecycle,
    });
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

  private async applyServiceEvent(input: ApplyInput, d: Record<string, unknown>): Promise<DocumentApplyTypedResult> {
    const { vehicleId, sourceFileUrl, documentType: docType } = input;
    const typeMap: Record<string, string> = {
      SERVICE: 'FULL_SERVICE',
      OIL_CHANGE: 'OIL_CHANGE',
      TUV_REPORT: 'TUV_INSPECTION',
      BOKRAFT_REPORT: 'BOKRAFT_INSPECTION',
    };
    const eventType = typeMap[docType];
    if (!eventType) {
      return createApplyFailure(['UNSUPPORTED_DOCUMENT_TYPE']);
    }
    const eventDateRaw = requireEventDate(d);
    if (isApplyFailure(eventDateRaw)) return eventDateRaw;
    const eventDate = dateFrom(eventDateRaw);
    if (!eventDate) {
      return createApplyFailure(['EVENT_DATE_REQUIRED']);
    }
    const odometerKmParsed = int(d?.odometerKm);
    const costCentsParsed = int(d?.costCents);
    const svcEvent = await this.prisma.vehicleServiceEvent.create({
      data: {
        vehicleId,
        eventType: eventType as any,
        eventDate,
        odometerKm: odometerKmParsed,
        workshopName: str(d.workshopName),
        notes: str(d.notes) ?? str(d.description),
        costCents: costCentsParsed,
        documentUrl: sourceFileUrl,
        origin: ServiceEventOrigin.AI_UPLOAD,
      },
    });

    if (docType === 'OIL_CHANGE') {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          lastOilChangeDate: eventDate,
          ...(odometerKmParsed != null ? { lastOilChangeOdometerKm: odometerKmParsed } : {}),
        },
      });
    }
    if (docType === 'SERVICE') {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          lastServiceDate: eventDate,
          ...(odometerKmParsed != null ? { lastServiceOdometerKm: odometerKmParsed } : {}),
        },
      });
    }
    if (docType === 'TUV_REPORT') {
      const validUntil = dateFrom(d.validUntil);
      if (!validUntil) {
        return createApplyFailure(['TUV_VALID_UNTIL_REQUIRED']);
      }
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { lastTuvDate: eventDate, nextTuvDate: validUntil },
      });
    }
    if (docType === 'BOKRAFT_REPORT') {
      const validUntil = dateFrom(d.validUntil);
      if (!validUntil) {
        return createApplyFailure(['BOKRAFT_VALID_UNTIL_REQUIRED']);
      }
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { lastBokraftDate: eventDate, nextBokraftDate: validUntil },
      });
    }

    return createApplySuccess({
      downstreamEntityType: 'service_event',
      downstreamEntityId: svcEvent.id,
      actionCount: 1,
      serviceEventId: svcEvent.id,
    });
  }

  private async applyBattery(input: ApplyInput, d: Record<string, unknown>): Promise<DocumentApplyTypedResult> {
    const { vehicleId, extractionId, sourceFileUrl } = input;
    const eventDateRaw = requireEventDate(d);
    if (isApplyFailure(eventDateRaw)) return eventDateRaw;
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
          workshopName: str(d.workshopName),
          notes: str(d.notes) ?? str(d.description),
          costCents: int(d?.costCents),
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

    const persistedEvidence = evidenceEntries.filter((entry) => entry.numericValue != null);
    if (persistedEvidence.length === 0) {
      return createApplyFailure(['BATTERY_EVIDENCE_NOT_PERSISTED']);
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

    return createApplySuccess({
      downstreamEntityType: 'battery_evidence',
      downstreamEntityId: serviceEventId ?? extractionId,
      actionCount: persistedEvidence.length,
      serviceEventId,
    });
  }

  private async applyFine(input: ApplyInput, d: Record<string, unknown>): Promise<DocumentApplyTypedResult> {
    const { vehicleId, sourceFileUrl, extractionId } = input;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) {
      return createApplyFailure(['VEHICLE_ORGANIZATION_REQUIRED']);
    }

    const offenseType = requireStr(d.offenseType, 'FINE_OFFENSE_TYPE_REQUIRED');
    if (isApplyFailure(offenseType)) return offenseType;
    const offenseDate = requireStr(d.eventDate, 'FINE_OFFENSE_DATE_REQUIRED');
    if (isApplyFailure(offenseDate)) return offenseDate;
    const summary = str(d.description);
    const breakdown = str(d.feeBreakdown);
    const descriptionParts = [summary, breakdown].filter(Boolean);
    const totalCents = requirePositiveInt(d.totalCents, 'FINE_POSITIVE_AMOUNT_REQUIRED');
    if (isApplyFailure(totalCents)) return totalCents;

    const fine = await this.finesService.create(vehicle.organizationId, {
      fineNumber: str(d.reportNumber),
      title: offenseType,
      description: descriptionParts.length > 0 ? descriptionParts.join('\n\n') : undefined,
      offenseType,
      issuingAuthority: str(d.issuingAuthority),
      offenseDate,
      location: str(d.location),
      amountCents: totalCents,
      currency: 'EUR',
      dueDate: this.str(d.dueDate),
      vehicleId,
      imageUrl: sourceFileUrl ?? undefined,
      extractedData: { ...d, documentExtractionId: extractionId },
      notes: breakdown ?? undefined,
    });

    return createApplySuccess({
      downstreamEntityType: 'fine',
      downstreamEntityId: String(fine.id),
      actionCount: 1,
      detail: { fineId: fine.id },
    });
  }

  private async applyInvoice(input: ApplyInput, d: Record<string, unknown>): Promise<DocumentApplyTypedResult> {
    const { vehicleId, sourceFileUrl } = input;
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    if (!vehicle?.organizationId) {
      return createApplyFailure(['VEHICLE_ORGANIZATION_REQUIRED']);
    }

    const orgId = vehicle.organizationId;
    const totalCentsParsed = requirePositiveInt(
      d?.totalCents ?? d?.costCents,
      'INVOICE_TOTAL_REQUIRED',
    );
    if (isApplyFailure(totalCentsParsed)) return totalCentsParsed;
    const invoiceDateRaw = requireStr(
      d.invoiceDate ?? d.eventDate,
      'INVOICE_DATE_REQUIRED',
    );
    if (isApplyFailure(invoiceDateRaw)) return invoiceDateRaw;
    const vendorNameRaw = str(d.vendorName) ?? str(d.workshopName) ?? '';
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
    if (!Array.isArray(d.lineItems) || d.lineItems.length === 0) {
      return createApplyFailure(['INVOICE_LINE_ITEMS_REQUIRED']);
    }
    const lineItems = d.lineItems
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => {
        const row = item as Record<string, unknown>;
        return {
          description: str(row.description),
          quantity: num(row.quantity),
          unitPriceNetCents: int(row.unitPriceNetCents),
          taxRate: num(row.taxRate),
        };
      });
    if (
      lineItems.some(
        (row) =>
          !row.description ||
          row.quantity == null ||
          row.unitPriceNetCents == null ||
          row.taxRate == null,
      )
    ) {
      return createApplyFailure(['INVOICE_LINE_ITEM_FIELDS_REQUIRED']);
    }
    const invoice = await this.invoicesService.create(orgId, {
      type: 'INCOMING_UPLOADED',
      vehicleId: input.vehicleId,
      title: str(d.title) ?? str(d.invoiceTitle) ?? '',
      description: str(d.description) ?? '',
      vendorId,
      vendorName: vendorNameRaw,
      totalCents: totalCentsParsed,
      invoiceDate: invoiceDateRaw,
      dueDate: str(d.dueDate),
      imageUrl: input.sourceFileUrl || undefined,
      extractedData: d,
      documentExtractionId: input.extractionId,
      fromExtraction: true,
      lineItems: lineItems.map((row) => ({
        description: row.description!,
        quantity: row.quantity!,
        unitPriceNetCents: row.unitPriceNetCents!,
        taxRate: row.taxRate!,
      })),
    });

    if (!invoice?.id) {
      return createApplyFailure(['INVOICE_NOT_PERSISTED']);
    }

    return createApplySuccess({
      downstreamEntityType: 'invoice',
      downstreamEntityId: String(invoice.id),
      actionCount: 1,
      detail: { invoiceId: invoice.id },
    });
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
