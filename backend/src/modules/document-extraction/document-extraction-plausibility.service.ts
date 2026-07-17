import { Injectable } from '@nestjs/common';
import { DocumentExtractionType } from '@prisma/client';
import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';

export type PlausibilityStatus = 'OK' | 'WARNING' | 'BLOCKER';
export type PlausibilitySource = 'DOCUMENT' | 'SYNQDRIVE_DB' | 'DIMO' | 'SYSTEM';

export interface PlausibilityCheck {
  code: string;
  status: PlausibilityStatus;
  message: string;
  source: PlausibilitySource;
}

export interface PlausibilityResult {
  overallStatus: PlausibilityStatus;
  checks: PlausibilityCheck[];
  recommendedHumanReviewNotes: string[];
}

export interface PlausibilityVehicleContext {
  vin?: string | null;
  licensePlate?: string | null;
  /** Best known current odometer (DIMO latest state or stored mileage). */
  lastKnownOdometerKm?: number | null;
  /** Whether DIMO telemetry context was available for this vehicle. */
  dimoContextAvailable?: boolean;
}

const NEGATIVE = -0.0001;

/**
 * Server-side plausibility checks for human review and apply gating.
 *
 * Extraction storage is never blocked. At confirm time a fresh run is executed;
 * unresolved BLOCKER checks prevent downstream apply (confirm may still persist
 * corrections). WARNING does not block apply.
 */
export interface PlausibilityRunOptions {
  extractionConflicts?: FieldExtractionEvidence[];
  chunkingWarnings?: string[];
}

@Injectable()
export class DocumentExtractionPlausibilityService {
  runChecks(
    documentType: DocumentExtractionType,
    fields: Record<string, unknown>,
    context: PlausibilityVehicleContext,
    options?: PlausibilityRunOptions,
  ): PlausibilityResult {
    const checks: PlausibilityCheck[] = [];
    const notes: string[] = [];

    const odometer = this.toNum(fields['odometerKm']);
    const lastKnown = context.lastKnownOdometerKm ?? null;
    const eventDate = this.toDate(fields['eventDate'] ?? fields['invoiceDate']);
    const now = new Date();

    // FINE: offense date and amount are mandatory before apply.
    if (documentType === 'FINE') {
      if (!eventDate) {
        checks.push({
          code: 'FINE_OFFENSE_DATE_REQUIRED',
          status: 'BLOCKER',
          message: 'Offense date (eventDate) is required before this fine can be applied.',
          source: 'DOCUMENT',
        });
      }
      const totalCents = this.toNum(fields['totalCents']);
      if (totalCents != null && totalCents < 0) {
        checks.push({
          code: 'NEGATIVE_AMOUNT',
          status: 'BLOCKER',
          message: 'Fine amount must not be negative.',
          source: 'DOCUMENT',
        });
      }
    }

    // Monetary fields — negative totals block apply across invoice/service docs.
    for (const key of ['totalCents', 'costCents'] as const) {
      const amount = this.toNum(fields[key]);
      if (amount != null && amount < 0) {
        checks.push({
          code: 'NEGATIVE_AMOUNT',
          status: 'BLOCKER',
          message: `${key} must not be negative.`,
          source: 'DOCUMENT',
        });
      }
    }

    // TÜV / BOKraft inspection date required before apply.
    if (documentType === 'TUV_REPORT' || documentType === 'BOKRAFT_REPORT') {
      if (!eventDate) {
        checks.push({
          code: 'TUV_INSPECTION_DATE_REQUIRED',
          status: 'BLOCKER',
          message: 'Inspection date (eventDate) is required before this report can be applied.',
          source: 'DOCUMENT',
        });
      }
    }

    // VIN / license plate cross-check (only when document carries an identifier)
    const docVin = this.toStr(fields['vin']);
    if (docVin && context.vin && this.normId(docVin) !== this.normId(context.vin)) {
      checks.push({
        code: 'VIN_MISMATCH',
        status: 'WARNING',
        message: 'VIN on the document does not match the selected vehicle.',
        source: 'DOCUMENT',
      });
    }
    const docPlate = this.toStr(fields['licensePlate']);
    if (docPlate && context.licensePlate && this.normPlate(docPlate) !== this.normPlate(context.licensePlate)) {
      const isFine = documentType === 'FINE';
      checks.push({
        code: 'PLATE_MISMATCH',
        status: isFine ? 'BLOCKER' : 'WARNING',
        message: isFine
          ? `Kennzeichen auf dem Dokument (${docPlate}) stimmt nicht mit dem zugeordneten Fahrzeug (${context.licensePlate}) überein.`
          : 'License plate on the document does not match the selected vehicle.',
        source: 'DOCUMENT',
      });
    }

    // Odometer sanity
    if (odometer != null) {
      if (odometer < NEGATIVE) {
        checks.push({
          code: 'ODOMETER_NEGATIVE',
          status: 'BLOCKER',
          message: 'Extracted odometer reading is negative.',
          source: 'DOCUMENT',
        });
      } else if (odometer > 2_000_000) {
        checks.push({
          code: 'ODOMETER_IMPLAUSIBLE_HIGH',
          status: 'WARNING',
          message: 'Extracted odometer reading is implausibly high.',
          source: 'DOCUMENT',
        });
      }
      if (lastKnown != null) {
        if (odometer > lastKnown + 200_000) {
          checks.push({
            code: 'ODOMETER_FAR_ABOVE_KNOWN',
            status: 'WARNING',
            message: `Odometer (${Math.round(odometer)} km) is far above last known mileage (${Math.round(lastKnown)} km).`,
            source: 'SYNQDRIVE_DB',
          });
        } else if (odometer < lastKnown - 50_000) {
          checks.push({
            code: 'ODOMETER_FAR_BELOW_KNOWN',
            status: 'WARNING',
            message: `Odometer (${Math.round(odometer)} km) is well below last known mileage (${Math.round(lastKnown)} km). Confirm this is a historical document.`,
            source: context.dimoContextAvailable ? 'DIMO' : 'SYNQDRIVE_DB',
          });
        }
      }
    }

    // Event date not in the future (for dated event documents)
    const futureProofTypes: DocumentExtractionType[] = []; // none currently allow a future primary date
    if (eventDate && eventDate.getTime() > now.getTime() + 24 * 3600 * 1000 && !futureProofTypes.includes(documentType)) {
      checks.push({
        code: 'EVENT_DATE_FUTURE',
        status: 'WARNING',
        message: 'Document date is in the future.',
        source: 'DOCUMENT',
      });
    }

    // Inspection validity must be after inspection date
    if (documentType === 'TUV_REPORT' || documentType === 'BOKRAFT_REPORT') {
      const validUntil = this.toDate(fields['validUntil']);
      if (eventDate && validUntil && validUntil.getTime() < eventDate.getTime()) {
        checks.push({
          code: 'VALIDITY_BEFORE_INSPECTION',
          status: 'WARNING',
          message: 'Validity date is before the inspection date.',
          source: 'DOCUMENT',
        });
      }
    }

    // Battery plausibility
    if (documentType === 'BATTERY') {
      const scope = this.toStr(fields['scope'])?.toLowerCase();
      const voltage = this.toNum(fields['voltageV']) ?? this.toNum(fields['restingVoltage']);
      const soh = this.toNum(fields['sohPercent']);
      if (scope === 'lv' && voltage != null && (voltage < 6 || voltage > 16)) {
        checks.push({
          code: 'LV_VOLTAGE_OUT_OF_RANGE',
          status: 'BLOCKER',
          message: `12V battery voltage (${voltage} V) is outside the plausible 6–16 V range.`,
          source: 'DOCUMENT',
        });
      }
      if (soh != null && (soh < 0 || soh > 100)) {
        checks.push({
          code: 'SOH_OUT_OF_RANGE',
          status: 'BLOCKER',
          message: `State of health (${soh}%) is outside 0–100%.`,
          source: 'DOCUMENT',
        });
      }
    }

    // Tire tread plausibility
    if (documentType === 'TIRE') {
      const tread = (fields['treadDepthMm'] as Record<string, unknown>) ?? {};
      for (const pos of ['fl', 'fr', 'rl', 'rr']) {
        const v = this.toNum(tread[pos]);
        if (v == null) continue;
        if (v < 0) {
          checks.push({
            code: `TREAD_NEGATIVE_${pos.toUpperCase()}`,
            status: 'BLOCKER',
            message: `Tread depth (${pos.toUpperCase()}) is negative.`,
            source: 'DOCUMENT',
          });
        } else if (v > 14) {
          checks.push({
            code: `TREAD_IMPLAUSIBLE_${pos.toUpperCase()}`,
            status: 'WARNING',
            message: `Tread depth ${pos.toUpperCase()} (${v} mm) is unrealistically high.`,
            source: 'DOCUMENT',
          });
        }
      }
    }

    // Damage / accident: do not assert a crash; note corroboration availability only.
    if (documentType === 'DAMAGE' || documentType === 'ACCIDENT') {
      notes.push(
        context.dimoContextAvailable
          ? 'DIMO telemetry is available for this vehicle but collision/harsh-braking corroboration is not automatically evaluated. Verify the incident manually.'
          : 'No DIMO telemetry context available to corroborate this incident. Verify the incident manually.',
      );
    }

    if (options?.chunkingWarnings?.length) {
      for (const warning of options.chunkingWarnings) {
        notes.push(warning);
        checks.push({
          code: 'DOCUMENT_CHUNK_LIMIT',
          status: 'WARNING',
          message: warning,
          source: 'SYSTEM',
        });
      }
    }

    for (const conflict of options?.extractionConflicts ?? []) {
      const leafKey = conflict.key.split('.').pop() ?? conflict.key;
      const pages =
        conflict.sourcePages.length > 0
          ? ` (pages ${conflict.sourcePages.join(', ')})`
          : '';
      const isBlocker =
        leafKey === 'odometerKm' || leafKey === 'vin' || leafKey === 'licensePlate';
      checks.push({
        code: `FIELD_CONFLICT_${leafKey.toUpperCase()}`,
        status: isBlocker ? 'BLOCKER' : 'WARNING',
        message: `Conflicting extracted values for ${leafKey}${pages} — manual review required`,
        source: 'DOCUMENT',
      });
    }

    const overallStatus = this.worst(checks);
    return { overallStatus, checks, recommendedHumanReviewNotes: notes };
  }

  private worst(checks: PlausibilityCheck[]): PlausibilityStatus {
    if (checks.some((c) => c.status === 'BLOCKER')) return 'BLOCKER';
    if (checks.some((c) => c.status === 'WARNING')) return 'WARNING';
    return 'OK';
  }

  private toNum(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const n = Number(v.trim().replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  private toStr(v: unknown): string | undefined {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
    return undefined;
  }

  private toDate(v: unknown): Date | undefined {
    if (typeof v !== 'string' || v.trim().length === 0) return undefined;
    const d = new Date(v.trim());
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private normId(v: string): string {
    return v.replace(/[\s-]/g, '').toUpperCase();
  }

  private normPlate(v: string): string {
    return this.normId(v);
  }
}
