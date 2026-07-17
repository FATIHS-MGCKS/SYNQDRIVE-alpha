import { Injectable } from '@nestjs/common';
import { DocumentExtractionType } from '@prisma/client';
import type { FieldExtractionEvidence } from '@modules/ai/documents/document-extraction-merge.service';
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
import { documentSchemaRegistry } from './document-schema-registry';
import { isApplyDocumentType } from './document-extraction.schemas';

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

    const registryEntry = isApplyDocumentType(documentType)
      ? documentSchemaRegistry.resolve({
          legacyDocumentType: documentType,
          documentSubtype: options?.documentSubtype,
        })
      : null;

    if (registryEntry && isApplyDocumentType(documentType)) {
      checks.push(
        ...documentSchemaRegistry.collectPlausibilityChecks(
          registryEntry,
          documentType,
          fields,
          context,
          options,
        ),
      );
    }

    if (documentType === 'DAMAGE' || documentType === 'ACCIDENT') {
      notes.push(
        context.dimoContextAvailable
          ? 'DIMO telemetry is available for this vehicle but collision/harsh-braking corroboration is not automatically evaluated. Verify the incident manually.'
          : 'No DIMO telemetry context available to corroborate this incident. Verify the incident manually.',
      );
    }

    if (!registryEntry) {
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
          { extractionConflicts: options?.extractionConflicts },
        ),
      );
    }

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
