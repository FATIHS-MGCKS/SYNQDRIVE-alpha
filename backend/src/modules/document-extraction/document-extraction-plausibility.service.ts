import { Injectable } from '@nestjs/common';
import { DocumentExtractionType } from '@prisma/client';
import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';
import { collectInvoicePlausibilityChecks } from './document-invoice-extraction.rules';
import {
  collectInspectionPlausibilityChecks,
  isInspectionDocumentType,
} from './document-inspection-extraction.rules';
import {
  collectDamagePlausibilityChecks,
  isDamageDocumentType,
} from './document-damage-extraction.rules';
import { collectTirePlausibilityChecks } from './document-tire-extraction.rules';
import { collectBrakePlausibilityChecks } from './document-brake-extraction.rules';
import { collectBatteryPlausibilityChecks } from './document-battery-extraction.rules';
import {
  collectArchivePlausibilityChecks,
  isArchiveDocumentType,
} from './document-archive-extraction.rules';
import {
  collectCrossDocumentConsistencyChecks,
  type PlausibilityConsistencyContext,
} from './document-plausibility-consistency.rules';
import {
  makePlausibilityCheck,
  resolveOverallPlausibilityStatus,
  type PlausibilityCheck,
  type PlausibilityOverallStatus,
  type PlausibilitySource,
} from './document-plausibility.types';

export type {
  PlausibilityCheck,
  PlausibilityCheckStatus,
  PlausibilityOverallStatus,
  PlausibilitySource,
} from './document-plausibility.types';
export {
  hasUnresolvedPlausibilityBlockers,
  getUnresolvedPlausibilityBlockers,
  resolveOverallPlausibilityStatus,
} from './document-plausibility.types';

/** @deprecated Use PlausibilityOverallStatus */
export type PlausibilityStatus = PlausibilityOverallStatus;

export interface PlausibilityResult {
  overallStatus: PlausibilityOverallStatus;
  checks: PlausibilityCheck[];
  recommendedHumanReviewNotes: string[];
}

export interface PlausibilityVehicleContext {
  vin?: string | null;
  licensePlate?: string | null;
  lastKnownOdometerKm?: number | null;
  dimoContextAvailable?: boolean;
}

export interface PlausibilityRunOptions extends PlausibilityConsistencyContext {
  extractionConflicts?: FieldExtractionEvidence[];
  chunkingWarnings?: string[];
  documentSubtype?: string | null;
}

function enrichLegacyChecks(checks: Array<Omit<PlausibilityCheck, 'explanation'>>): PlausibilityCheck[] {
  return checks.map((check) => ({
    ...check,
    explanation: check.message,
  }));
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

    if (documentType === 'INVOICE') {
      checks.push(
        ...enrichLegacyChecks(
          collectInvoicePlausibilityChecks(fields, {
            documentSubtype: options?.documentSubtype,
          }),
        ),
      );
    } else if (isInspectionDocumentType(documentType)) {
      checks.push(...enrichLegacyChecks(collectInspectionPlausibilityChecks(documentType, fields)));
    } else if (isDamageDocumentType(documentType)) {
      checks.push(...enrichLegacyChecks(collectDamagePlausibilityChecks(documentType, fields)));
      notes.push(
        context.dimoContextAvailable
          ? 'DIMO telemetry is available for this vehicle but collision/harsh-braking corroboration is not automatically evaluated. Verify the incident manually.'
          : 'No DIMO telemetry context available to corroborate this incident. Verify the incident manually.',
      );
    } else if (documentType === 'TIRE') {
      checks.push(...enrichLegacyChecks(collectTirePlausibilityChecks(fields)));
    } else if (documentType === 'BRAKE') {
      checks.push(...enrichLegacyChecks(collectBrakePlausibilityChecks(fields)));
    } else if (documentType === 'BATTERY') {
      checks.push(...enrichLegacyChecks(collectBatteryPlausibilityChecks(fields)));
    } else if (isArchiveDocumentType(documentType)) {
      checks.push(...enrichLegacyChecks(collectArchivePlausibilityChecks(documentType, fields)));
    }

    checks.push(
      ...collectCrossDocumentConsistencyChecks(
        documentType,
        fields,
        {
          vehicle: context,
          existingInvoiceNumbers: options?.existingInvoiceNumbers,
          existingReferenceNumbers: options?.existingReferenceNumbers,
          bookingStartDate: options?.bookingStartDate,
          bookingEndDate: options?.bookingEndDate,
          currentExtractionId: options?.currentExtractionId,
        },
        {
          extractionConflicts: options?.extractionConflicts,
        },
      ),
    );

    if (options?.chunkingWarnings?.length) {
      for (const warning of options.chunkingWarnings) {
        notes.push(warning);
        checks.push(
          makePlausibilityCheck({
            code: 'DOCUMENT_CHUNK_LIMIT',
            status: 'WARNING',
            explanation: warning,
            source: 'SYSTEM',
          }),
        );
      }
    }

    const overallStatus = resolveOverallPlausibilityStatus(checks);
    return { overallStatus, checks, recommendedHumanReviewNotes: notes };
  }
}
