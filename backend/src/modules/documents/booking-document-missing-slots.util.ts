import { DOCUMENT_TYPE, LEGAL_DOCUMENT_TYPES, legalDocumentTitleDe, type DocumentType } from './documents.constants';
import type { BookingDocumentPhase } from './booking-document-phase.util';
import { DOCUMENT_PHASE_REQUIREMENTS } from './booking-document-phase.util';
import type { MissingBookingDocumentSlot } from './booking-document-task.types';
import { hasOrgActiveLegalDocument } from './legal-document-type.compat';

const CHECKLIST_SLOT_PREFIX = 'documentSlot:';

export function checklistSlotMarker(documentType: DocumentType): string {
  return `${CHECKLIST_SLOT_PREFIX}${documentType}`;
}

export function parseChecklistSlotMarker(description: string | null | undefined): DocumentType | null {
  if (!description?.startsWith(CHECKLIST_SLOT_PREFIX)) return null;
  return description.slice(CHECKLIST_SLOT_PREFIX.length) as DocumentType;
}

export function buildDocumentPackageTaskTitle(missingCount: number): string {
  if (missingCount <= 0) return 'Dokumentenpaket vollständig';
  if (missingCount === 1) return 'Dokumentenpaket unvollständig – 1 Dokument fehlt';
  return `Dokumentenpaket unvollständig – ${missingCount} Dokumente fehlen`;
}

export function computeMissingDocumentSlots(input: {
  phase: BookingDocumentPhase;
  bundle: Record<string, string | null | undefined>;
  orgActiveLegal: Partial<Record<DocumentType, { id: string } | undefined>>;
  generationError: string | null;
}): MissingBookingDocumentSlot[] {
  const required = DOCUMENT_PHASE_REQUIREMENTS[input.phase];
  const missing: MissingBookingDocumentSlot[] = [];

  for (const documentType of required) {
    const pointerField = bundlePointerField(documentType);
    if (pointerField && input.bundle[pointerField]) continue;

    const isLegal = (LEGAL_DOCUMENT_TYPES as string[]).includes(documentType) ||
      documentType === DOCUMENT_TYPE.WITHDRAWAL_INFORMATION;
    const orgLegalConfigured = isLegal && hasOrgActiveLegalDocument(input.orgActiveLegal, documentType);
    const configurationProblem = isLegal && !orgLegalConfigured;

    if (configurationProblem) {
      continue;
    }

    const generationFailed = !!input.generationError && !isLegal;
    missing.push({
      documentType,
      humanReadableLabel: legalDocumentTitleDe(documentType, null),
      reason: generationFailed ? 'generation_failed' : 'not_generated',
      actionType: generationFailed ? 'RETRY' : isLegal ? 'GENERATE' : 'GENERATE',
      canGenerateAutomatically: !isLegal || orgLegalConfigured,
      configurationProblem: false,
    });
  }

  return missing;
}

function bundlePointerField(documentType: DocumentType): string | null {
  const map: Partial<Record<DocumentType, string>> = {
    [DOCUMENT_TYPE.BOOKING_INVOICE]: 'bookingInvoiceDocumentId',
    [DOCUMENT_TYPE.DEPOSIT_RECEIPT]: 'depositReceiptDocumentId',
    [DOCUMENT_TYPE.RENTAL_CONTRACT]: 'rentalContractDocumentId',
    [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: 'termsDocumentId',
    [DOCUMENT_TYPE.CONSUMER_INFORMATION]: 'withdrawalDocumentId',
    [DOCUMENT_TYPE.WITHDRAWAL_INFORMATION]: 'withdrawalDocumentId',
    [DOCUMENT_TYPE.HANDOVER_PICKUP]: 'pickupProtocolDocumentId',
    [DOCUMENT_TYPE.HANDOVER_RETURN]: 'returnProtocolDocumentId',
    [DOCUMENT_TYPE.FINAL_INVOICE]: 'finalInvoiceDocumentId',
  };
  return map[documentType] ?? null;
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
  return missing;
}
