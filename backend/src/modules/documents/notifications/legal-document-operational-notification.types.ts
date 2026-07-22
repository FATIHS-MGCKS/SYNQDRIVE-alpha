import type { NotificationEntityType, NotificationSeverity } from '@modules/notifications/notification.enums';
import type { BundleCompletenessResult } from '../booking-document-completeness.types';
import type { DocumentType } from '../documents.constants';
import type {
  LegalDocumentCategoryKey,
  LegalNotificationEventType,
  LegalNotificationScope,
} from './legal-document-operational-notification.constants';

export interface LegalDocumentOrgReadinessRow {
  id: string;
  documentType: string;
  legalVariant?: string | null;
  versionLabel: string;
  status: string;
  language: string;
  jurisdictionCountry: string;
  scanStatus: string;
  integrityStatus: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
}

export interface LegalDocumentOrgReadinessState {
  organizationId: string;
  documents: LegalDocumentOrgReadinessRow[];
  evaluatedAt: string;
}

export interface LegalDocumentBundleNotificationInput {
  organizationId: string;
  bookingId: string;
  bookingRef: string;
  completeness: BundleCompletenessResult;
}

export interface LegalDocumentPickupGateNotificationInput {
  organizationId: string;
  bookingId: string;
  bookingRef: string;
  blockingCodes: string[];
}

export interface LegalDocumentIntegrityNotificationInput {
  organizationId: string;
  legalDocumentId?: string;
  objectKey: string;
  status: string;
  detail?: string;
  source: string;
}

export interface LegalDocumentTechnicalNotificationInput {
  organizationId: string;
  eventType: LegalNotificationEventType;
  detail?: string;
  sourceRef: string;
  legalDocumentId?: string;
  documentType?: string;
  bookingId?: string;
}

export interface LegalOperationalNotificationSignal {
  eventType: LegalNotificationEventType;
  scope: LegalNotificationScope;
  entityType: NotificationEntityType;
  entityId: string;
  /** Stable variant within entity scope — typically document type or gate code. */
  conditionVariant?: string;
  severity: NotificationSeverity;
  templateParams: Record<string, string | number | boolean | null>;
  metadata?: Record<string, unknown>;
  sourceRef: string;
  legalDocumentId?: string;
  documentType?: DocumentType | LegalDocumentCategoryKey | string;
  settingsTab?: string;
}

export interface LegalOperationalNotificationDerivationResult {
  active: LegalOperationalNotificationSignal[];
  /** Fingerprints to resolve when condition clears (computed by service). */
  scopeKey: string;
}
