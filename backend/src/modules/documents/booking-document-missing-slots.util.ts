import { DOCUMENT_TYPE, LEGAL_DOCUMENT_TYPES, legalDocumentTitleDe, type DocumentType } from './documents.constants';
import type { BookingDocumentPhase } from './booking-document-phase.util';
import { DOCUMENT_PHASE_REQUIREMENTS } from './booking-document-phase.util';
import type { MissingBookingDocumentSlot } from './booking-document-task.types';
import { hasOrgActiveLegalDocument } from './legal-document-type.compat';
import { resolveBundlePointerField } from './booking-document-bundle-pointer.mapping';
import { evaluateBookingDocumentCompleteness } from './booking-document-completeness.engine';
import type { BookingDocumentCompletenessContext } from './booking-document-completeness.types';

/**
 * @deprecated Use BookingDocumentCompletenessService — kept for backward-compatible tests.
 */
export function computeMissingDocumentSlots(input: {
  phase: BookingDocumentPhase;
  bundle: Record<string, string | null | undefined>;
  orgActiveLegal: Partial<Record<DocumentType, { id: string } | undefined>>;
  generationError: string | null;
}): MissingBookingDocumentSlot[] {
  const ctx = buildCompletenessContextFromLegacyInput(input);
  const result = evaluateBookingDocumentCompleteness(ctx);
  const phaseResult = result.phases.find((p) => p.phase === input.phase);
  return phaseResult?.missingDocuments ?? [];
}

function buildCompletenessContextFromLegacyInput(input: {
  phase: BookingDocumentPhase;
  bundle: Record<string, string | null | undefined>;
  orgActiveLegal: Partial<Record<DocumentType, { id: string } | undefined>>;
  generationError: string | null;
}): BookingDocumentCompletenessContext {
  const bookingStatus =
    input.phase === 'CONFIRMED' ? 'CONFIRMED' : input.phase === 'ACTIVE' ? 'ACTIVE' : 'COMPLETED';

  const resolverMissingMandatory: Array<{ documentType: string; reason: string }> = [];
  for (const documentType of LEGAL_DOCUMENT_TYPES) {
    if (!hasOrgActiveLegalDocument(input.orgActiveLegal, documentType)) {
      resolverMissingMandatory.push({
        documentType,
        reason: 'No active org legal template',
      });
    }
  }

  return {
    organizationId: 'legacy-eval',
    bookingId: 'legacy-eval',
    bookingStatus,
    bundle: {
      termsDocumentId: (input.bundle.termsDocumentId as string) ?? null,
      withdrawalDocumentId: (input.bundle.withdrawalDocumentId as string) ?? null,
      privacyDocumentId: (input.bundle.privacyDocumentId as string) ?? null,
      bookingInvoiceDocumentId: (input.bundle.bookingInvoiceDocumentId as string) ?? null,
      depositReceiptDocumentId: (input.bundle.depositReceiptDocumentId as string) ?? null,
      rentalContractDocumentId: (input.bundle.rentalContractDocumentId as string) ?? null,
      pickupProtocolDocumentId: (input.bundle.pickupProtocolDocumentId as string) ?? null,
      returnProtocolDocumentId: (input.bundle.returnProtocolDocumentId as string) ?? null,
      finalInvoiceDocumentId: (input.bundle.finalInvoiceDocumentId as string) ?? null,
    },
    generatedDocuments: [],
    legalDocumentsById: new Map(
      Object.entries(input.orgActiveLegal)
        .filter(([, v]) => v?.id)
        .map(([documentType, v]) => [
          v!.id,
          {
            id: v!.id,
            documentType,
            integrityStatus: 'VERIFIED',
            integrityUnavailable: false,
            scanStatus: 'SCAN_PASSED',
          },
        ]),
    ),
    resolverVersion: 'legacy',
    resolverConflicts: [],
    resolverMissingMandatory,
    resolverSelectedTypes: [],
    handoverProtocols: [],
    deliveryProofs: [],
    generationError: input.generationError,
    orgActiveLegalTypes: (
      [
        DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        DOCUMENT_TYPE.CONSUMER_INFORMATION,
        DOCUMENT_TYPE.PRIVACY_POLICY,
      ] as DocumentType[]
    ).filter((t) => hasOrgActiveLegalDocument(input.orgActiveLegal, t)),
    evaluatedAt: new Date().toISOString(),
  };
}

export function orgMissingLegalTemplateTypes(
  orgActiveLegal: Partial<Record<DocumentType, { id: string } | undefined>>,
): DocumentType[] {
  const missing: DocumentType[] = [];
  if (!orgActiveLegal[DOCUMENT_TYPE.TERMS_AND_CONDITIONS]) {
    missing.push(DOCUMENT_TYPE.TERMS_AND_CONDITIONS);
  }
  if (
    !orgActiveLegal[DOCUMENT_TYPE.CONSUMER_INFORMATION] &&
    !orgActiveLegal[DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]
  ) {
    missing.push(DOCUMENT_TYPE.CONSUMER_INFORMATION);
  }
  if (!orgActiveLegal[DOCUMENT_TYPE.PRIVACY_POLICY]) {
    missing.push(DOCUMENT_TYPE.PRIVACY_POLICY);
  }
  return missing;
}
