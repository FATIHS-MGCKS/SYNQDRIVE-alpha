import {
  applicableDocumentPhases,
  DOCUMENT_PHASE_REQUIREMENTS,
  type BookingDocumentPhase,
} from './booking-document-phase.util';
import { bundlePointerValue } from './booking-document-bundle-pointer.mapping';
import {
  BUNDLE_COMPLETENESS_REASON_CODE,
  BUNDLE_COMPLETENESS_STATUS,
  DELIVERY_PROOF_DOCUMENT_TYPES,
  pickHigherPriorityCompletenessStatus,
  type BundleCompletenessStatus,
} from './booking-document-completeness.constants';
import type {
  BookingDocumentCompletenessContext,
  BundleCompletenessMissingItem,
  BundleCompletenessReason,
  BundleCompletenessResult,
  BundleLegalSlotCompleteness,
  BundlePhaseCompleteness,
  GeneratedDocumentCompletenessRow,
} from './booking-document-completeness.types';
import {
  BUNDLE_STATUS,
  DOCUMENT_STATUS,
  DOCUMENT_TYPE,
  legalDocumentTitleDe,
  type BundleStatus,
  type DocumentType,
} from './documents.constants';
import { hasOrgActiveLegalDocument } from './legal-document-type.compat';
import { isLegalDocumentIntegrityBlocking } from './integrity/legal-document-integrity.constants';
import { isLegalDocumentScanPassed } from './legal-document-scan-status.constants';
import type { MissingBookingDocumentSlot } from './booking-document-task.types';

const LEGAL_SLOTS: Array<{ key: 'terms' | 'consumer' | 'privacy'; type: DocumentType }> = [
  { key: 'terms', type: DOCUMENT_TYPE.TERMS_AND_CONDITIONS },
  { key: 'consumer', type: DOCUMENT_TYPE.CONSUMER_INFORMATION },
  { key: 'privacy', type: DOCUMENT_TYPE.PRIVACY_POLICY },
];

const CONSUMER_LOOKUP_TYPES = [
  DOCUMENT_TYPE.CONSUMER_INFORMATION,
  DOCUMENT_TYPE.WITHDRAWAL_INFORMATION,
] as const;

const DELIVERY_PROOF_EMAIL_STATUSES = new Set(['SENT', 'SENT_SIMULATED']);

export function cumulativeRequiredDocumentTypes(bookingStatus: string): DocumentType[] {
  const phases = applicableDocumentPhases(bookingStatus);
  const types = new Set<DocumentType>();
  for (const phase of phases) {
    for (const documentType of DOCUMENT_PHASE_REQUIREMENTS[phase]) {
      types.add(documentType);
    }
  }
  return [...types];
}

function lookupTypesFor(documentType: DocumentType): DocumentType[] {
  if (documentType === DOCUMENT_TYPE.CONSUMER_INFORMATION) {
    return [...CONSUMER_LOOKUP_TYPES];
  }
  return [documentType];
}

function findPresentDocument(
  documentType: DocumentType,
  ctx: BookingDocumentCompletenessContext,
): GeneratedDocumentCompletenessRow | null {
  const pointerId = ctx.bundle ? bundlePointerValue(ctx.bundle, documentType) : null;
  if (pointerId) {
    const byPointer = ctx.generatedDocuments.find(
      (d) => d.id === pointerId && d.status !== DOCUMENT_STATUS.VOID,
    );
    if (byPointer) return byPointer;
    return {
      id: pointerId,
      documentType,
      status: DOCUMENT_STATUS.GENERATED,
      legalDocumentId: null,
      sentAt: null,
    };
  }
  const lookup = lookupTypesFor(documentType);
  return (
    ctx.generatedDocuments.find(
      (d) =>
        lookup.includes(d.documentType as DocumentType) && d.status !== DOCUMENT_STATUS.VOID,
    ) ?? null
  );
}

function isOrgConfigurationGap(
  documentType: DocumentType,
  ctx: BookingDocumentCompletenessContext,
): boolean {
  const isLegal = LEGAL_SLOTS.some((s) => s.type === documentType);
  if (!isLegal) return false;
  const orgActiveLegal: Partial<Record<DocumentType, { id: string }>> = {};
  for (const t of ctx.orgActiveLegalTypes) {
    orgActiveLegal[t] = { id: 'active' };
  }
  return !hasOrgActiveLegalDocument(orgActiveLegal, documentType);
}

function isScopeExempt(documentType: DocumentType, ctx: BookingDocumentCompletenessContext): boolean {
  return isOrgConfigurationGap(documentType, ctx);
}

function evaluateLegalSlot(
  documentType: DocumentType,
  ctx: BookingDocumentCompletenessContext,
  required: boolean,
): BundleLegalSlotCompleteness {
  const presentDoc = findPresentDocument(documentType, ctx);
  const scopeExempt = isScopeExempt(documentType, ctx);
  const legalRow = presentDoc?.legalDocumentId
    ? ctx.legalDocumentsById.get(presentDoc.legalDocumentId) ?? null
    : null;

  return {
    documentType,
    required: required && !scopeExempt,
    present: !!presentDoc,
    scopeExempt,
    generatedDocumentId: presentDoc?.id ?? null,
    legalDocumentId: presentDoc?.legalDocumentId ?? null,
    integrityStatus: legalRow?.integrityStatus ?? null,
    scanStatus: legalRow?.scanStatus ?? null,
  };
}

function hasDeliveryProof(
  documentId: string,
  doc: GeneratedDocumentCompletenessRow,
  ctx: BookingDocumentCompletenessContext,
): boolean {
  if (doc.status === DOCUMENT_STATUS.SENT || doc.sentAt) return true;
  return ctx.deliveryProofs.some(
    (p) =>
      p.generatedDocumentId === documentId && DELIVERY_PROOF_EMAIL_STATUSES.has(p.emailStatus),
  );
}

function buildMissingSlot(
  documentType: DocumentType,
  reason: MissingBookingDocumentSlot['reason'],
  configurationProblem: boolean,
  generationError: string | null,
): MissingBookingDocumentSlot {
  const generationFailed = reason === 'generation_failed' || (!!generationError && !configurationProblem);
  return {
    documentType,
    humanReadableLabel: legalDocumentTitleDe(documentType, null),
    reason: generationFailed ? 'generation_failed' : reason,
    actionType: configurationProblem ? 'UPLOAD_LEGAL' : generationFailed ? 'RETRY' : 'GENERATE',
    canGenerateAutomatically: !configurationProblem,
    configurationProblem,
  };
}

function toLegacyBundleStatus(
  status: BundleCompletenessStatus,
  presentCount: number,
  requiredCount: number,
  generationError: string | null,
): BundleStatus {
  if (status === BUNDLE_COMPLETENESS_STATUS.COMPLETE) return BUNDLE_STATUS.COMPLETE;
  if (
    status === BUNDLE_COMPLETENESS_STATUS.BLOCKED ||
    status === BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED
  ) {
    return presentCount === 0 && generationError ? BUNDLE_STATUS.FAILED : BUNDLE_STATUS.PARTIAL;
  }
  if (presentCount === 0 && !generationError) return BUNDLE_STATUS.PENDING;
  if (presentCount === requiredCount) return BUNDLE_STATUS.PARTIAL;
  return presentCount > 0 ? BUNDLE_STATUS.PARTIAL : BUNDLE_STATUS.PENDING;
}

/**
 * Pure, idempotent bundle completeness evaluation.
 * All consumers must use this engine — no parallel status derivations.
 */
export function evaluateBookingDocumentCompleteness(
  ctx: BookingDocumentCompletenessContext,
): BundleCompletenessResult {
  const evaluatedAt = ctx.evaluatedAt ?? new Date().toISOString();
  const cumulativeRequired = cumulativeRequiredDocumentTypes(ctx.bookingStatus);
  const missingItems: BundleCompletenessMissingItem[] = [];
  const blockingReasons: BundleCompletenessReason[] = [];
  const nonBlockingWarnings: BundleCompletenessReason[] = [];
  const affectedDocumentTypes = new Set<DocumentType>();
  let status: BundleCompletenessStatus = BUNDLE_COMPLETENESS_STATUS.COMPLETE;

  const orgConfigurationGaps: DocumentType[] = LEGAL_SLOTS.map((s) => s.type).filter((t) =>
    isOrgConfigurationGap(t, ctx),
  );

  for (const conflict of ctx.resolverConflicts) {
    const documentType = conflict.documentType as DocumentType;
    affectedDocumentTypes.add(documentType);
    blockingReasons.push({
      code: BUNDLE_COMPLETENESS_REASON_CODE.RESOLVER_CONFLICT,
      message: `Resolver conflict for ${documentType}: ${conflict.reason}`,
      documentType,
      blocking: true,
    });
    status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.BLOCKED);
  }

  if (ctx.generationError) {
    blockingReasons.push({
      code: BUNDLE_COMPLETENESS_REASON_CODE.GENERATION_FAILED,
      message: ctx.generationError,
      blocking: true,
    });
    status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.BLOCKED);
  }

  const legal: BundleCompletenessResult['legal'] = {
    terms: evaluateLegalSlot(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, ctx, true),
    consumer: evaluateLegalSlot(DOCUMENT_TYPE.CONSUMER_INFORMATION, ctx, true),
    privacy: evaluateLegalSlot(DOCUMENT_TYPE.PRIVACY_POLICY, ctx, true),
  };

  for (const slot of Object.values(legal)) {
    affectedDocumentTypes.add(slot.documentType);

    if (slot.present && slot.legalDocumentId) {
      const legalRow = ctx.legalDocumentsById.get(slot.legalDocumentId);
      if (legalRow) {
        if (legalRow.integrityUnavailable || isLegalDocumentIntegrityBlocking(legalRow.integrityStatus)) {
          const code =
            legalRow.integrityStatus === 'CHECKSUM_MISMATCH'
              ? BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_CHECKSUM_MISMATCH
              : legalRow.integrityStatus === 'MISSING_OBJECT'
                ? BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_MISSING_OBJECT
                : legalRow.integrityStatus === 'STORAGE_ERROR'
                  ? BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_STORAGE_ERROR
                  : BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_UNAVAILABLE;
          blockingReasons.push({
            code,
            message: `Integrity failure for ${slot.documentType}: ${legalRow.integrityStatus ?? 'unavailable'}`,
            documentType: slot.documentType,
            blocking: true,
          });
          missingItems.push({
            documentType: slot.documentType,
            humanReadableLabel: legalDocumentTitleDe(slot.documentType, null),
            reason: 'integrity_failed',
            blocking: true,
            scopeExempt: false,
          });
          status = pickHigherPriorityCompletenessStatus(
            status,
            BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED,
          );
        } else if (!isLegalDocumentScanPassed(legalRow.scanStatus)) {
          blockingReasons.push({
            code: BUNDLE_COMPLETENESS_REASON_CODE.SCAN_NOT_PASSED,
            message: `Scan not passed for ${slot.documentType}: ${legalRow.scanStatus ?? 'unknown'}`,
            documentType: slot.documentType,
            blocking: true,
          });
          missingItems.push({
            documentType: slot.documentType,
            humanReadableLabel: legalDocumentTitleDe(slot.documentType, null),
            reason: 'scan_failed',
            blocking: true,
            scopeExempt: false,
          });
          status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.BLOCKED);
        }
      }
    }

    if (!slot.required) continue;
    if (!slot.present && !slot.scopeExempt) {
      const mandatory = ctx.resolverMissingMandatory.find((m) => m.documentType === slot.documentType);
      missingItems.push({
        documentType: slot.documentType,
        humanReadableLabel: legalDocumentTitleDe(slot.documentType, null),
        reason: mandatory ? 'configuration_problem' : 'not_generated',
        blocking: true,
        scopeExempt: false,
      });
      if (!mandatory) {
        status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.INCOMPLETE);
      } else {
        nonBlockingWarnings.push({
          code: BUNDLE_COMPLETENESS_REASON_CODE.ORG_CONFIGURATION_GAP,
          message: mandatory.reason,
          documentType: slot.documentType,
          blocking: false,
        });
      }
    }
  }

  const presentTypes: DocumentType[] = [];
  for (const documentType of cumulativeRequired) {
    const presentDoc = findPresentDocument(documentType, ctx);
    const scopeExempt = isScopeExempt(documentType, ctx);

    if (presentDoc) {
      if (presentDoc.status === DOCUMENT_STATUS.DRAFT) {
        blockingReasons.push({
          code: BUNDLE_COMPLETENESS_REASON_CODE.GENERATION_IN_PROGRESS,
          message: `${documentType} generation in progress`,
          documentType,
          blocking: false,
        });
        status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.GENERATING);
      }
      if (presentDoc.status === DOCUMENT_STATUS.FAILED) {
        blockingReasons.push({
          code: BUNDLE_COMPLETENESS_REASON_CODE.GENERATION_FAILED,
          message: `${documentType} generation failed`,
          documentType,
          blocking: true,
        });
        status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.BLOCKED);
      }
      presentTypes.push(documentType);
      continue;
    }

    if (scopeExempt) continue;

    const isLegal = LEGAL_SLOTS.some((s) => s.type === documentType);
    if (!isLegal) {
      affectedDocumentTypes.add(documentType);
      missingItems.push({
        documentType,
        humanReadableLabel: legalDocumentTitleDe(documentType, null),
        reason: ctx.generationError ? 'generation_failed' : 'not_generated',
        blocking: false,
        scopeExempt: false,
      });
      status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.INCOMPLETE);
    }
  }

  const requiresDeliveryProof =
    ctx.bookingStatus === 'CONFIRMED' ||
    ctx.bookingStatus === 'ACTIVE' ||
    ctx.bookingStatus === 'COMPLETED';

  if (requiresDeliveryProof) {
    for (const deliveryType of DELIVERY_PROOF_DOCUMENT_TYPES) {
      if (!cumulativeRequired.includes(deliveryType as DocumentType)) continue;
      const presentDoc = findPresentDocument(deliveryType as DocumentType, ctx);
      if (!presentDoc || presentDoc.status === DOCUMENT_STATUS.VOID) continue;
      if (!hasDeliveryProof(presentDoc.id, presentDoc, ctx)) {
        affectedDocumentTypes.add(deliveryType as DocumentType);
        nonBlockingWarnings.push({
          code: BUNDLE_COMPLETENESS_REASON_CODE.DELIVERY_PROOF_MISSING,
          message: `${legalDocumentTitleDe(deliveryType as DocumentType, null)} not yet delivered to customer`,
          documentType: deliveryType as DocumentType,
          blocking: false,
        });
        if (ctx.bookingStatus === 'ACTIVE' || ctx.bookingStatus === 'COMPLETED') {
          status = pickHigherPriorityCompletenessStatus(
            status,
            BUNDLE_COMPLETENESS_STATUS.DELIVERY_PENDING,
          );
        }
      }
    }
  }

  const pickupProtocol = ctx.handoverProtocols.find((p) => p.kind === 'PICKUP');
  if (
    (ctx.bookingStatus === 'ACTIVE' || ctx.bookingStatus === 'COMPLETED') &&
    pickupProtocol &&
    !pickupProtocol.documentsAcknowledged
  ) {
    nonBlockingWarnings.push({
      code: BUNDLE_COMPLETENESS_REASON_CODE.ACKNOWLEDGMENT_MISSING,
      message: 'Pickup handover documents not yet acknowledged by customer',
      blocking: false,
    });
    status = pickHigherPriorityCompletenessStatus(
      status,
      BUNDLE_COMPLETENESS_STATUS.ACKNOWLEDGMENT_PENDING,
    );
  }

  const mandatoryLegalMissing =
    !legal.terms.present || !legal.consumer.present || !legal.privacy.present;

  if (mandatoryLegalMissing) {
    status = pickHigherPriorityCompletenessStatus(status, BUNDLE_COMPLETENESS_STATUS.INCOMPLETE);
  }

  if (
    status !== BUNDLE_COMPLETENESS_STATUS.COMPLETE &&
    status !== BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED &&
    status !== BUNDLE_COMPLETENESS_STATUS.BLOCKED &&
    status !== BUNDLE_COMPLETENESS_STATUS.GENERATING &&
    status !== BUNDLE_COMPLETENESS_STATUS.DELIVERY_PENDING &&
    status !== BUNDLE_COMPLETENESS_STATUS.ACKNOWLEDGMENT_PENDING &&
    missingItems.some((m) => !m.scopeExempt && m.blocking)
  ) {
    status = BUNDLE_COMPLETENESS_STATUS.INCOMPLETE;
  } else if (
    status === BUNDLE_COMPLETENESS_STATUS.COMPLETE &&
    missingItems.some((m) => !m.scopeExempt && !m.blocking)
  ) {
    status = BUNDLE_COMPLETENESS_STATUS.INCOMPLETE;
  } else if (
    status !== BUNDLE_COMPLETENESS_STATUS.COMPLETE &&
    status !== BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED &&
    status !== BUNDLE_COMPLETENESS_STATUS.BLOCKED &&
    status !== BUNDLE_COMPLETENESS_STATUS.GENERATING &&
    status !== BUNDLE_COMPLETENESS_STATUS.DELIVERY_PENDING &&
    status !== BUNDLE_COMPLETENESS_STATUS.ACKNOWLEDGMENT_PENDING &&
    missingItems.some((m) => !m.scopeExempt)
  ) {
    status = BUNDLE_COMPLETENESS_STATUS.INCOMPLETE;
  }

  const phases: BundlePhaseCompleteness[] = buildPhaseCompleteness(ctx, cumulativeRequired);

  const legacyBundleStatus = toLegacyBundleStatus(
    status,
    presentTypes.length,
    cumulativeRequired.filter((t) => !isScopeExempt(t, ctx)).length,
    ctx.generationError,
  );

  return {
    status,
    legacyBundleStatus,
    missingItems,
    blockingReasons,
    nonBlockingWarnings,
    evaluatedAt,
    resolverVersion: ctx.resolverVersion,
    affectedDocumentTypes: [...affectedDocumentTypes],
    phases,
    legal,
    orgConfigurationGaps,
    cumulativeRequiredTypes: cumulativeRequired,
    presentTypes,
  };
}

function buildPhaseCompleteness(
  ctx: BookingDocumentCompletenessContext,
  cumulativeRequired: DocumentType[],
): BundlePhaseCompleteness[] {
  const phases = applicableDocumentPhases(ctx.bookingStatus);
  return phases.map((phase) => {
    const requiredTypes = DOCUMENT_PHASE_REQUIREMENTS[phase];
    const presentTypes: DocumentType[] = [];
    const missingDocuments: MissingBookingDocumentSlot[] = [];

    for (const documentType of requiredTypes) {
      const presentDoc = findPresentDocument(documentType, ctx);
      const scopeExempt = isScopeExempt(documentType, ctx);
      const configurationProblem = isOrgConfigurationGap(documentType, ctx);

      if (presentDoc && presentDoc.status !== DOCUMENT_STATUS.VOID) {
        presentTypes.push(documentType);
        continue;
      }

      if (configurationProblem || scopeExempt) continue;

      missingDocuments.push(
        buildMissingSlot(
          documentType,
          configurationProblem ? 'configuration_problem' : 'not_generated',
          configurationProblem,
          ctx.generationError,
        ),
      );
    }

    return { phase, requiredTypes, presentTypes, missingDocuments };
  });
}

export function completenessToBundleViewWarnings(result: BundleCompletenessResult): string[] {
  const warnings: string[] = [];
  if (result.orgConfigurationGaps.length > 0) {
    warnings.push(
      'Dokumentenpaket unvollständig: AGB, Verbraucherinformation oder Datenschutzhinweis fehlt. Bitte in Administration → Unternehmen hochladen.',
    );
  } else if (result.blockingReasons.some((r) => r.code === BUNDLE_COMPLETENESS_REASON_CODE.GENERATION_FAILED)) {
    const msg = result.blockingReasons.find((r) => r.code === BUNDLE_COMPLETENESS_REASON_CODE.GENERATION_FAILED)?.message;
    warnings.push(`Dokumentenerstellung fehlgeschlagen: ${msg ?? 'unbekannter Fehler'}`);
  } else if (result.status === BUNDLE_COMPLETENESS_STATUS.GENERATING) {
    warnings.push('Dokumente werden vorbereitet. Bitte kurz warten oder die Seite aktualisieren.');
  } else if (result.missingItems.length > 0) {
    warnings.push('Dokumentenpaket unvollständig — fehlende Dokumente werden nachgeneriert.');
  }
  for (const w of result.nonBlockingWarnings) {
    if (w.code === BUNDLE_COMPLETENESS_REASON_CODE.DELIVERY_PROOF_MISSING) {
      warnings.push('Buchungsrechnung wurde noch nicht an den Kunden versendet.');
    }
    if (w.code === BUNDLE_COMPLETENESS_REASON_CODE.ACKNOWLEDGMENT_MISSING) {
      warnings.push('Übergabeprotokoll: Dokumentenbestätigung durch Kunden ausstehend.');
    }
  }
  return warnings;
}

export function completenessLegalMissingDocumentTypes(result: BundleCompletenessResult): DocumentType[] {
  const missing: DocumentType[] = [];
  if (!result.legal.terms.present) {
    missing.push(DOCUMENT_TYPE.TERMS_AND_CONDITIONS);
  }
  if (!result.legal.consumer.present) {
    missing.push(DOCUMENT_TYPE.CONSUMER_INFORMATION);
  }
  if (!result.legal.privacy.present) {
    missing.push(DOCUMENT_TYPE.PRIVACY_POLICY);
  }
  return missing;
}

/** Legacy API labels for missingLegalDocuments. */
export function completenessToLegacyMissingLegalLabels(result: BundleCompletenessResult): string[] {
  const labels: string[] = [];
  if (!result.legal.terms.present) labels.push('TERMS_AND_CONDITIONS');
  if (!result.legal.consumer.present) labels.push('REVOCATION_POLICY');
  if (!result.legal.privacy.present) labels.push('PRIVACY_POLICY');
  return labels;
}
