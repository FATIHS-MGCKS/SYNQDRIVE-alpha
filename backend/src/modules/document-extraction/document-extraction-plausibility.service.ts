import { Injectable } from '@nestjs/common';
import { DocumentExtractionType } from '@prisma/client';

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
 * Server-side plausibility checks. These NEVER block storage of an extraction —
 * they only inform the human review step. The worst individual status becomes
 * the overall status.
 *
 * Checks are grounded in the SynqDrive vehicle record (and DIMO-derived odometer
 * where available). The AI agent's own plausibility output is not trusted here;
 * its advisory notes are merged separately by the worker.
 */
@Injectable()
export class DocumentExtractionPlausibilityService {
  runChecks(
    documentType: DocumentExtractionType,
    fields: Record<string, unknown>,
    context: PlausibilityVehicleContext,
  ): PlausibilityResult {
    const checks: PlausibilityCheck[] = [];
    const notes: string[] = [];

    const odometer = this.toNum(fields['odometerKm']);
    const lastKnown = context.lastKnownOdometerKm ?? null;
    const eventDate = this.toDate(fields['eventDate'] ?? fields['invoiceDate']);
    const now = new Date();

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
    if (docPlate && context.licensePlate && this.normId(docPlate) !== this.normId(context.licensePlate)) {
      checks.push({
        code: 'PLATE_MISMATCH',
        status: 'WARNING',
        message: 'License plate on the document does not match the selected vehicle.',
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
          code: 'LV_VOLTAGE_RANGE',
          status: 'WARNING',
          message: `12V battery voltage (${voltage} V) is outside the plausible 6–16 V range.`,
          source: 'DOCUMENT',
        });
      }
      if (soh != null && (soh < 0 || soh > 100)) {
        checks.push({
          code: 'SOH_RANGE',
          status: 'WARNING',
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
}
