import { NotificationEntityType, NotificationSeverity } from '@modules/notifications/notification.enums';
import {
  BUNDLE_COMPLETENESS_REASON_CODE,
  BUNDLE_COMPLETENESS_STATUS,
} from '../booking-document-completeness.constants';
import { DOCUMENT_TYPE, legalDocumentTitleDe } from '../documents.constants';
import {
  LEGAL_NOTIFICATION_EVENT,
  LEGAL_NOTIFICATION_SCOPE,
  type LegalNotificationEventType,
} from './legal-document-operational-notification.constants';
import {
  categoryTitleDe,
  countActiveDocuments,
  groupDocumentsByCategory,
  hasExpectedJurisdictionCoverage,
  hasExpectedLanguageCoverage,
  isExpiringSoon,
  isIntegrityBlocking,
  isScanBlocking,
  legalDocumentCategoryKey,
  pickActiveDocument,
} from './legal-document-org-readiness.evaluator';
import type {
  LegalDocumentBundleNotificationInput,
  LegalDocumentIntegrityNotificationInput,
  LegalDocumentOrgReadinessState,
  LegalDocumentPickupGateNotificationInput,
  LegalDocumentTechnicalNotificationInput,
  LegalOperationalNotificationDerivationResult,
  LegalOperationalNotificationSignal,
} from './legal-document-operational-notification.types';

const PICKUP_PROOF_CODES = new Set([
  'DELIVERY_PENDING',
  'LEGAL_PRESENTATION_MISSING',
  'LEGAL_ACKNOWLEDGMENT_MISSING',
  'DOCUMENTS_NOT_ACKNOWLEDGED',
]);

function signal(
  partial: Omit<LegalOperationalNotificationSignal, 'scope'> & { scope?: LegalOperationalNotificationSignal['scope'] },
): LegalOperationalNotificationSignal {
  return {
    scope: partial.scope ?? LEGAL_NOTIFICATION_SCOPE.ORG_READINESS,
    ...partial,
  };
}

function dedupeSignals(signals: LegalOperationalNotificationSignal[]): LegalOperationalNotificationSignal[] {
  const map = new Map<string, LegalOperationalNotificationSignal>();
  for (const s of signals) {
    const key = [
      s.eventType,
      s.entityType,
      s.entityId,
      s.conditionVariant ?? '',
    ].join('|');
    const existing = map.get(key);
    if (!existing || severityRank(s.severity) > severityRank(existing.severity)) {
      map.set(key, s);
    }
  }
  return [...map.values()];
}

function severityRank(severity: NotificationSeverity): number {
  switch (severity) {
    case NotificationSeverity.CRITICAL:
      return 3;
    case NotificationSeverity.WARNING:
      return 2;
    case NotificationSeverity.INFO:
      return 1;
    default:
      return 0;
  }
}

function suppressTechnicalDuplicates(
  signals: LegalOperationalNotificationSignal[],
): LegalOperationalNotificationSignal[] {
  const userIntegrityDocIds = new Set(
    signals
      .filter((s) => s.eventType === LEGAL_NOTIFICATION_EVENT.INTEGRITY_CHECK_FAILED)
      .map((s) => s.legalDocumentId)
      .filter(Boolean),
  );

  return signals.filter((s) => {
    if (
      (s.eventType === LEGAL_NOTIFICATION_EVENT.TECH_HASH_MISMATCH ||
        s.eventType === LEGAL_NOTIFICATION_EVENT.TECH_STORAGE_OBJECT_MISSING) &&
      s.legalDocumentId &&
      userIntegrityDocIds.has(s.legalDocumentId)
    ) {
      return false;
    }
    return true;
  });
}

export function deriveOrgReadinessNotifications(
  state: LegalDocumentOrgReadinessState,
): LegalOperationalNotificationSignal[] {
  const { organizationId } = state;
  const grouped = groupDocumentsByCategory(state.documents);
  const signals: LegalOperationalNotificationSignal[] = [];

  for (const categoryKey of Object.keys(grouped) as Array<keyof typeof grouped>) {
    const versions = grouped[categoryKey];
    const categoryTitle = categoryTitleDe(categoryKey);
    const active = pickActiveDocument(versions);
    const activeCount = countActiveDocuments(versions);

    if (activeCount.length > 1) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.TECH_MULTIPLE_ACTIVE_VERSIONS,
          scope: LEGAL_NOTIFICATION_SCOPE.ORG_TECHNICAL,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.CRITICAL,
          templateParams: {
            categoryTitle,
            activeCount: activeCount.length,
          },
          metadata: {
            categoryKey,
            documentIds: activeCount.map((d) => d.id),
          },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:multi-active`,
          settingsTab: 'legal-documents',
        }),
      );
    }

    if (versions.length === 0) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.REQUIRED_DOCUMENT_MISSING,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.CRITICAL,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
          },
          metadata: { categoryKey },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:missing`,
          documentType: categoryKey,
          settingsTab: 'legal-documents',
        }),
      );
      continue;
    }

    if (!active) {
      const pendingReview = versions.some((v) => v.status === 'IN_REVIEW');
      const approved = versions.some((v) => v.status === 'APPROVED');
      if (pendingReview) {
        signals.push(
          signal({
            eventType: LEGAL_NOTIFICATION_EVENT.APPROVAL_PENDING,
            entityType: NotificationEntityType.ORGANIZATION,
            entityId: organizationId,
            conditionVariant: categoryKey,
            severity: NotificationSeverity.WARNING,
            templateParams: { documentType: categoryTitle, categoryTitle },
            metadata: { categoryKey },
            sourceRef: `org-readiness:${organizationId}:${categoryKey}:approval-pending`,
            settingsTab: 'legal-documents',
          }),
        );
      } else if (!approved) {
        signals.push(
          signal({
            eventType: LEGAL_NOTIFICATION_EVENT.REQUIRED_DOCUMENT_MISSING,
            entityType: NotificationEntityType.ORGANIZATION,
            entityId: organizationId,
            conditionVariant: categoryKey,
            severity: NotificationSeverity.CRITICAL,
            templateParams: { documentType: categoryTitle, categoryTitle },
            metadata: { categoryKey, reason: 'no_active_version' },
            sourceRef: `org-readiness:${organizationId}:${categoryKey}:not-ready`,
            documentType: categoryKey,
            settingsTab: 'legal-documents',
          }),
        );
      }
      continue;
    }

    if (active.status === 'SCHEDULED') {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.ACTIVATION_SCHEDULED,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.INFO,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
            versionLabel: active.versionLabel,
          },
          metadata: { categoryKey, legalDocumentId: active.id },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:scheduled`,
          legalDocumentId: active.id,
          settingsTab: 'legal-documents',
        }),
      );
    }

    if (versions.length > 0 && !hasExpectedLanguageCoverage(versions)) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.REQUIRED_LANGUAGE_MISSING,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.WARNING,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
            expectedLanguage: 'DE',
          },
          metadata: { categoryKey },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:language`,
          settingsTab: 'legal-documents',
        }),
      );
    }

    if (versions.length > 0 && !hasExpectedJurisdictionCoverage(versions)) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.REQUIRED_JURISDICTION_MISSING,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.WARNING,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
            expectedJurisdiction: 'DE',
          },
          metadata: { categoryKey },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:jurisdiction`,
          settingsTab: 'legal-documents',
        }),
      );
    }

    if (isScanBlocking(active.scanStatus)) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.SCAN_FAILED,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.CRITICAL,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
            versionLabel: active.versionLabel,
          },
          metadata: { categoryKey, legalDocumentId: active.id, scanStatus: active.scanStatus },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:scan`,
          legalDocumentId: active.id,
          settingsTab: 'legal-documents',
        }),
      );
    }

    if (isIntegrityBlocking(active.integrityStatus)) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.INTEGRITY_CHECK_FAILED,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.CRITICAL,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
            versionLabel: active.versionLabel,
          },
          metadata: {
            categoryKey,
            legalDocumentId: active.id,
            integrityStatus: active.integrityStatus,
          },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:integrity`,
          legalDocumentId: active.id,
          settingsTab: 'legal-documents',
        }),
      );
    }

    if (isExpiringSoon(active.validUntil)) {
      signals.push(
        signal({
          eventType: LEGAL_NOTIFICATION_EVENT.DOCUMENT_EXPIRING_SOON,
          entityType: NotificationEntityType.ORGANIZATION,
          entityId: organizationId,
          conditionVariant: categoryKey,
          severity: NotificationSeverity.WARNING,
          templateParams: {
            documentType: categoryTitle,
            categoryTitle,
            versionLabel: active.versionLabel,
            validUntil: active.validUntil?.toISOString() ?? '',
          },
          metadata: { categoryKey, legalDocumentId: active.id },
          sourceRef: `org-readiness:${organizationId}:${categoryKey}:expiry`,
          legalDocumentId: active.id,
          settingsTab: 'legal-documents',
        }),
      );
    }
  }

  return dedupeSignals(signals);
}

export function deriveBundleNotifications(
  input: LegalDocumentBundleNotificationInput,
): LegalOperationalNotificationSignal[] {
  const { organizationId, bookingId, bookingRef, completeness } = input;
  const signals: LegalOperationalNotificationSignal[] = [];

  // Org configuration gaps are handled exclusively by org readiness — do not duplicate here.
  if (completeness.orgConfigurationGaps.length > 0) {
    return [];
  }

  const hasBlocking =
    completeness.status === BUNDLE_COMPLETENESS_STATUS.BLOCKED ||
    completeness.status === BUNDLE_COMPLETENESS_STATUS.INCOMPLETE ||
    completeness.status === BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED;

  if (hasBlocking) {
    const missingLabels = completeness.missingItems
      .filter((m) => m.blocking && !m.scopeExempt)
      .map((m) => m.humanReadableLabel)
      .join(', ');
    signals.push(
      signal({
        eventType: LEGAL_NOTIFICATION_EVENT.BUNDLE_INCOMPLETE,
        scope: LEGAL_NOTIFICATION_SCOPE.BOOKING_BUNDLE,
        entityType: NotificationEntityType.BOOKING,
        entityId: bookingId,
        severity:
          completeness.status === BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED
            ? NotificationSeverity.CRITICAL
            : NotificationSeverity.WARNING,
        templateParams: {
          bookingRef,
          documentType: missingLabels || completeness.status,
          status: completeness.status,
        },
        metadata: {
          completenessStatus: completeness.status,
          missingItems: completeness.missingItems,
        },
        sourceRef: `bundle:${organizationId}:${bookingId}:incomplete`,
      }),
    );
  }

  const deliveryFailed = completeness.blockingReasons.some(
    (r) => r.code === BUNDLE_COMPLETENESS_REASON_CODE.DELIVERY_PROOF_MISSING,
  );
  if (deliveryFailed) {
    signals.push(
      signal({
        eventType: LEGAL_NOTIFICATION_EVENT.DOCUMENT_DELIVERY_FAILED,
        scope: LEGAL_NOTIFICATION_SCOPE.BOOKING_BUNDLE,
        entityType: NotificationEntityType.BOOKING,
        entityId: bookingId,
        severity: NotificationSeverity.WARNING,
        templateParams: { bookingRef, documentType: 'Buchungsdokumente' },
        metadata: { reasons: completeness.blockingReasons },
        sourceRef: `bundle:${organizationId}:${bookingId}:delivery-failed`,
      }),
    );
  }

  return dedupeSignals(signals);
}

export function derivePickupGateNotifications(
  input: LegalDocumentPickupGateNotificationInput,
): LegalOperationalNotificationSignal[] {
  const proofCodes = input.blockingCodes.filter((c) => PICKUP_PROOF_CODES.has(c));
  if (proofCodes.length === 0) return [];

  return [
    signal({
      eventType: LEGAL_NOTIFICATION_EVENT.PICKUP_BLOCKED_MISSING_PROOF,
      scope: LEGAL_NOTIFICATION_SCOPE.BOOKING_PICKUP,
      entityType: NotificationEntityType.BOOKING,
      entityId: input.bookingId,
      conditionVariant: proofCodes[0],
      severity: NotificationSeverity.WARNING,
      templateParams: {
        bookingRef: input.bookingRef,
        documentType: proofCodes.join(', '),
      },
      metadata: { codes: proofCodes },
      sourceRef: `pickup-gate:${input.organizationId}:${input.bookingId}:${proofCodes[0]}`,
    }),
  ];
}

export function deriveIntegrityTechnicalNotification(
  input: LegalDocumentIntegrityNotificationInput,
): LegalOperationalNotificationSignal | null {
  const status = input.status.toUpperCase();
  let eventType: LegalNotificationEventType = LEGAL_NOTIFICATION_EVENT.TECH_STORAGE_OBJECT_MISSING;
  if (status === 'CHECKSUM_MISMATCH') {
    eventType = LEGAL_NOTIFICATION_EVENT.TECH_HASH_MISMATCH;
  } else if (status === 'UNEXPECTED_OBJECT') {
    eventType = LEGAL_NOTIFICATION_EVENT.TECH_STORAGE_OBJECT_MISSING;
  }

  return signal({
    eventType,
    scope: LEGAL_NOTIFICATION_SCOPE.DOCUMENT_INTEGRITY,
    entityType: NotificationEntityType.ORGANIZATION,
    entityId: input.organizationId,
    conditionVariant: input.legalDocumentId ?? input.objectKey,
    severity: NotificationSeverity.CRITICAL,
    templateParams: {
      documentType: input.legalDocumentId
        ? legalDocumentTitleDe(DOCUMENT_TYPE.TERMS_AND_CONDITIONS, null)
        : 'Rechtstext-Speicher',
      categoryTitle: 'Technischer Alarm',
    },
    metadata: {
      technicalDetail: input.detail,
      objectKey: input.objectKey,
      source: input.source,
      integrityStatus: input.status,
    },
    sourceRef: `integrity:${input.organizationId}:${input.legalDocumentId ?? input.objectKey}:${status}`,
    legalDocumentId: input.legalDocumentId,
    settingsTab: 'legal-documents',
  });
}

export function deriveTechnicalNotification(
  input: LegalDocumentTechnicalNotificationInput,
): LegalOperationalNotificationSignal {
  return signal({
    eventType: input.eventType,
    scope: LEGAL_NOTIFICATION_SCOPE.ORG_TECHNICAL,
    entityType: input.bookingId ? NotificationEntityType.BOOKING : NotificationEntityType.ORGANIZATION,
    entityId: input.bookingId ?? input.organizationId,
    conditionVariant: input.documentType ?? input.legalDocumentId,
    severity: NotificationSeverity.CRITICAL,
    templateParams: {
      documentType: input.documentType
        ? legalDocumentTitleDe(input.documentType as never, null)
        : 'Rechtstexte',
      categoryTitle: 'Technischer Alarm',
      bookingRef: input.bookingId ?? '',
    },
    metadata: {
      technicalDetail: input.detail,
      legalDocumentId: input.legalDocumentId,
    },
    sourceRef: input.sourceRef,
    legalDocumentId: input.legalDocumentId,
    documentType: input.documentType,
    settingsTab: 'legal-documents',
  });
}

export function mergeLegalOperationalSignals(
  ...groups: LegalOperationalNotificationSignal[][]
): LegalOperationalNotificationSignal[] {
  return suppressTechnicalDuplicates(dedupeSignals(groups.flat()));
}

export function buildOrgReadinessDerivation(
  state: LegalDocumentOrgReadinessState,
): LegalOperationalNotificationDerivationResult {
  return {
    active: deriveOrgReadinessNotifications(state),
    scopeKey: `${LEGAL_NOTIFICATION_SCOPE.ORG_READINESS}:${state.organizationId}`,
  };
}

export function buildBundleDerivation(
  input: LegalDocumentBundleNotificationInput,
): LegalOperationalNotificationDerivationResult {
  return {
    active: deriveBundleNotifications(input),
    scopeKey: `${LEGAL_NOTIFICATION_SCOPE.BOOKING_BUNDLE}:${input.organizationId}:${input.bookingId}`,
  };
}
