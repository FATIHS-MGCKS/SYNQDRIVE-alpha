import { MembershipRole, NotificationCategory } from '@prisma/client';
import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from '../notification.enums';
import type { NotificationEventTypeDefinition } from './notification-event-registry.types';
import {
  bookingTarget,
  legalDocumentsSettingsTarget,
} from './notification-event-target.builders';
import {
  DEFAULT_CRITICAL_DELIVERY,
  DEFAULT_IN_APP_DELIVERY,
  STATE_RESOLUTION,
} from './notification-event-registry.policies';

const OPS_ROLES = [
  MembershipRole.ORG_ADMIN,
  MembershipRole.SUB_ADMIN,
  MembershipRole.WORKER,
] as const;

const ADMIN_ROLES = [MembershipRole.ORG_ADMIN, MembershipRole.SUB_ADMIN] as const;

function legalOrgStateDef(
  slug: string,
  eventType: string,
  conditionCode: string,
  severity: NotificationSeverity,
  titleKey: string,
  bodyKey: string,
): NotificationEventTypeDefinition {
  return {
    slug,
    eventType,
    domain: NotificationDomain.DOCUMENTS,
    defaultEntityType: NotificationEntityType.ORGANIZATION,
    conditionCode,
    fingerprintVersion: 1,
    eventKind: NotificationEventKind.STATE,
    defaultSeverity: severity,
    allowedSeverityEscalations: [NotificationSeverity.INFO, NotificationSeverity.WARNING, NotificationSeverity.CRITICAL],
    titleKey,
    bodyKey,
    requiredTemplateParams: ['documentType', 'categoryTitle'],
    actionType: NotificationActionType.OPEN_RENTAL,
    actionTargetBuilder: legalDocumentsSettingsTarget,
    sourceType: NotificationSourceType.WORKFLOW,
    resolutionPolicy: STATE_RESOLUTION,
    deliveryPolicy: DEFAULT_IN_APP_DELIVERY,
    preferenceCategory: NotificationCategory.DOCUMENTS,
    supportedRoles: OPS_ROLES,
    requiresNavigation: true,
    shadowModeEnabled: false,
    producerModule: 'documents',
  };
}

function legalBookingStateDef(
  slug: string,
  eventType: string,
  conditionCode: string,
  severity: NotificationSeverity,
  titleKey: string,
  bodyKey: string,
  requiredTemplateParams: readonly string[],
): NotificationEventTypeDefinition {
  return {
    slug,
    eventType,
    domain: NotificationDomain.DOCUMENTS,
    defaultEntityType: NotificationEntityType.BOOKING,
    conditionCode,
    fingerprintVersion: 1,
    eventKind: NotificationEventKind.STATE,
    defaultSeverity: severity,
    allowedSeverityEscalations: [NotificationSeverity.WARNING, NotificationSeverity.CRITICAL],
    titleKey,
    bodyKey,
    requiredTemplateParams,
    actionType: NotificationActionType.OPEN_BOOKING,
    actionTargetBuilder: bookingTarget,
    sourceType: NotificationSourceType.WORKFLOW,
    resolutionPolicy: STATE_RESOLUTION,
    deliveryPolicy: DEFAULT_IN_APP_DELIVERY,
    preferenceCategory: NotificationCategory.DOCUMENTS,
    supportedRoles: OPS_ROLES,
    requiresNavigation: true,
    shadowModeEnabled: false,
    producerModule: 'documents',
  };
}

function legalTechDef(
  slug: string,
  eventType: string,
  conditionCode: string,
): NotificationEventTypeDefinition {
  return {
    slug,
    eventType,
    domain: NotificationDomain.SYSTEM,
    defaultEntityType: NotificationEntityType.ORGANIZATION,
    conditionCode,
    fingerprintVersion: 1,
    eventKind: NotificationEventKind.STATE,
    defaultSeverity: NotificationSeverity.CRITICAL,
    allowedSeverityEscalations: [NotificationSeverity.WARNING, NotificationSeverity.CRITICAL],
    titleKey: `notification.title.${slug}`,
    bodyKey: `notification.body.${slug}`,
    requiredTemplateParams: ['categoryTitle'],
    actionType: NotificationActionType.OPEN_RENTAL,
    actionTargetBuilder: legalDocumentsSettingsTarget,
    sourceType: NotificationSourceType.SYSTEM,
    resolutionPolicy: STATE_RESOLUTION,
    deliveryPolicy: DEFAULT_CRITICAL_DELIVERY,
    preferenceCategory: NotificationCategory.DOCUMENTS,
    supportedRoles: ADMIN_ROLES,
    requiresNavigation: true,
    shadowModeEnabled: false,
    producerModule: 'documents',
  };
}

export const LEGAL_DOCUMENT_NOTIFICATION_EVENT_DEFINITIONS = [
  legalOrgStateDef(
    'legal-required-document-missing',
    'LEGAL_REQUIRED_DOCUMENT_MISSING',
    'legal_required_document_missing',
    NotificationSeverity.CRITICAL,
    'notification.title.legalRequiredDocumentMissing',
    'notification.body.legalRequiredDocumentMissing',
  ),
  legalOrgStateDef(
    'legal-required-language-missing',
    'LEGAL_REQUIRED_LANGUAGE_MISSING',
    'legal_required_language_missing',
    NotificationSeverity.WARNING,
    'notification.title.legalRequiredLanguageMissing',
    'notification.body.legalRequiredLanguageMissing',
  ),
  legalOrgStateDef(
    'legal-required-jurisdiction-missing',
    'LEGAL_REQUIRED_JURISDICTION_MISSING',
    'legal_required_jurisdiction_missing',
    NotificationSeverity.WARNING,
    'notification.title.legalRequiredJurisdictionMissing',
    'notification.body.legalRequiredJurisdictionMissing',
  ),
  legalOrgStateDef(
    'legal-approval-pending',
    'LEGAL_APPROVAL_PENDING',
    'legal_approval_pending',
    NotificationSeverity.WARNING,
    'notification.title.legalApprovalPending',
    'notification.body.legalApprovalPending',
  ),
  legalOrgStateDef(
    'legal-activation-scheduled',
    'LEGAL_ACTIVATION_SCHEDULED',
    'legal_activation_scheduled',
    NotificationSeverity.INFO,
    'notification.title.legalActivationScheduled',
    'notification.body.legalActivationScheduled',
  ),
  legalOrgStateDef(
    'legal-document-expiring-soon',
    'LEGAL_DOCUMENT_EXPIRING_SOON',
    'legal_document_expiring_soon',
    NotificationSeverity.WARNING,
    'notification.title.legalDocumentExpiringSoon',
    'notification.body.legalDocumentExpiringSoon',
  ),
  legalOrgStateDef(
    'legal-scan-failed',
    'LEGAL_SCAN_FAILED',
    'legal_scan_failed',
    NotificationSeverity.CRITICAL,
    'notification.title.legalScanFailed',
    'notification.body.legalScanFailed',
  ),
  legalOrgStateDef(
    'legal-integrity-check-failed',
    'LEGAL_INTEGRITY_CHECK_FAILED',
    'legal_integrity_check_failed',
    NotificationSeverity.CRITICAL,
    'notification.title.legalIntegrityCheckFailed',
    'notification.body.legalIntegrityCheckFailed',
  ),
  legalBookingStateDef(
    'legal-bundle-incomplete',
    'LEGAL_BUNDLE_INCOMPLETE',
    'legal_bundle_incomplete',
    NotificationSeverity.WARNING,
    'notification.title.legalBundleIncomplete',
    'notification.body.legalBundleIncomplete',
    ['bookingRef', 'documentType'],
  ),
  legalBookingStateDef(
    'legal-document-delivery-failed',
    'LEGAL_DOCUMENT_DELIVERY_FAILED',
    'legal_document_delivery_failed',
    NotificationSeverity.WARNING,
    'notification.title.legalDocumentDeliveryFailed',
    'notification.body.legalDocumentDeliveryFailed',
    ['bookingRef', 'documentType'],
  ),
  legalBookingStateDef(
    'legal-pickup-blocked-missing-proof',
    'LEGAL_PICKUP_BLOCKED_MISSING_PROOF',
    'legal_pickup_blocked_missing_proof',
    NotificationSeverity.WARNING,
    'notification.title.legalPickupBlockedMissingProof',
    'notification.body.legalPickupBlockedMissingProof',
    ['bookingRef', 'documentType'],
  ),
  legalTechDef(
    'legal-tech-multiple-active-versions',
    'LEGAL_TECH_MULTIPLE_ACTIVE_VERSIONS',
    'legal_tech_multiple_active_versions',
  ),
  legalTechDef(
    'legal-tech-storage-object-missing',
    'LEGAL_TECH_STORAGE_OBJECT_MISSING',
    'legal_tech_storage_object_missing',
  ),
  legalTechDef(
    'legal-tech-hash-mismatch',
    'LEGAL_TECH_HASH_MISMATCH',
    'legal_tech_hash_mismatch',
  ),
  legalTechDef(
    'legal-tech-queue-job-dead',
    'LEGAL_TECH_QUEUE_JOB_DEAD',
    'legal_tech_queue_job_dead',
  ),
  legalTechDef(
    'legal-tech-malware-scanner-unavailable',
    'LEGAL_TECH_MALWARE_SCANNER_UNAVAILABLE',
    'legal_tech_malware_scanner_unavailable',
  ),
  legalTechDef(
    'legal-tech-object-storage-unavailable',
    'LEGAL_TECH_OBJECT_STORAGE_UNAVAILABLE',
    'legal_tech_object_storage_unavailable',
  ),
  legalTechDef(
    'legal-tech-reconciliation-failed',
    'LEGAL_TECH_RECONCILIATION_FAILED',
    'legal_tech_reconciliation_failed',
  ),
  legalTechDef(
    'legal-tech-unmapped-document-type',
    'LEGAL_TECH_UNMAPPED_DOCUMENT_TYPE',
    'legal_tech_unmapped_document_type',
  ),
  legalTechDef(
    'legal-tech-resolver-conflict-unresolvable',
    'LEGAL_TECH_RESOLVER_CONFLICT_UNRESOLVABLE',
    'legal_tech_resolver_conflict_unresolvable',
  ),
] as const satisfies readonly NotificationEventTypeDefinition[];
