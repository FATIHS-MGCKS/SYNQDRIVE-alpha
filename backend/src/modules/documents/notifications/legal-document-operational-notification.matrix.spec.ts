import { NotificationEntityType, NotificationSeverity } from '@modules/notifications/notification.enums';
import { DOCUMENT_TYPE } from '../documents.constants';
import { BUNDLE_COMPLETENESS_STATUS } from '../booking-document-completeness.constants';
import { BUNDLE_STATUS } from '../documents.constants';
import { LEGAL_NOTIFICATION_EVENT } from './legal-document-operational-notification.constants';
import {
  deriveBundleNotifications,
  deriveOrgReadinessNotifications,
  mergeLegalOperationalSignals,
} from './legal-document-operational-notification.matrix';
import type { LegalDocumentOrgReadinessState } from './legal-document-operational-notification.types';
import { legalOperationalNotificationFingerprintKey } from './legal-document-operational-notification.dedup';

const ORG = 'org-notify-test';

function baseState(docs: LegalDocumentOrgReadinessState['documents']): LegalDocumentOrgReadinessState {
  return { organizationId: ORG, documents: docs, evaluatedAt: new Date().toISOString() };
}

describe('legal-document-operational-notification.matrix', () => {
  it('deduplicates identical org readiness signals', () => {
    const state = baseState([
      {
        id: 't1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
        status: 'DRAFT',
        language: 'de',
        jurisdictionCountry: 'DE',
        scanStatus: 'UPLOADED',
        integrityStatus: null,
        validFrom: null,
        validUntil: null,
      },
    ]);
    const signals = deriveOrgReadinessNotifications(state);
    const first = signals.find(
      (s) => s.eventType === LEGAL_NOTIFICATION_EVENT.REQUIRED_DOCUMENT_MISSING,
    );
    expect(first).toBeDefined();
    const merged = mergeLegalOperationalSignals([first!, first!]);
    expect(merged).toHaveLength(1);
  });

  it('re-evaluates the same error with stable fingerprint', () => {
    const state = baseState([
      {
        id: 't1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        versionLabel: 'v1',
        status: 'DRAFT',
        language: 'de',
        jurisdictionCountry: 'DE',
        scanStatus: 'UPLOADED',
        integrityStatus: null,
        validFrom: null,
        validUntil: null,
      },
    ]);
    const first = deriveOrgReadinessNotifications(state)[0];
    const second = deriveOrgReadinessNotifications(state)[0];
    expect(legalOperationalNotificationFingerprintKey(ORG, first)).toBe(
      legalOperationalNotificationFingerprintKey(ORG, second),
    );
  });

  it('resolves missing-document signal when active template exists', () => {
    const missing = deriveOrgReadinessNotifications(
      baseState([
        {
          id: 't1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          status: 'DRAFT',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'UPLOADED',
          integrityStatus: null,
          validFrom: null,
          validUntil: null,
        },
      ]),
    );
    const ready = deriveOrgReadinessNotifications(
      baseState([
        {
          id: 't2',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v2',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'c1',
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'p1',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
      ]),
    );
    expect(missing.some((s) => s.eventType === LEGAL_NOTIFICATION_EVENT.REQUIRED_DOCUMENT_MISSING)).toBe(
      true,
    );
    expect(ready.some((s) => s.eventType === LEGAL_NOTIFICATION_EVENT.REQUIRED_DOCUMENT_MISSING)).toBe(
      false,
    );
  });

  it('escalates severity for integrity failures', () => {
    const signals = deriveOrgReadinessNotifications(
      baseState([
        {
          id: 't1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'CHECKSUM_MISMATCH',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'c1',
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'p1',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
      ]),
    );
    const integrity = signals.find(
      (s) => s.eventType === LEGAL_NOTIFICATION_EVENT.INTEGRITY_CHECK_FAILED,
    );
    expect(integrity?.severity).toBe(NotificationSeverity.CRITICAL);
  });

  it('isolates tenants via organization-scoped entity ids', () => {
    const orgA = deriveOrgReadinessNotifications({
      organizationId: 'org-a',
      documents: [],
      evaluatedAt: new Date().toISOString(),
    });
    const orgB = deriveOrgReadinessNotifications({
      organizationId: 'org-b',
      documents: [],
      evaluatedAt: new Date().toISOString(),
    });
    expect(orgA[0].entityId).toBe('org-a');
    expect(orgB[0].entityId).toBe('org-b');
    expect(legalOperationalNotificationFingerprintKey('org-a', orgA[0])).not.toBe(
      legalOperationalNotificationFingerprintKey('org-b', orgB[0]),
    );
  });

  it('emits separate signals per document category', () => {
    const signals = deriveOrgReadinessNotifications(baseState([]));
    const categories = new Set(signals.map((s) => s.conditionVariant));
    expect(categories.has('TERMS_AND_CONDITIONS')).toBe(true);
    expect(categories.has('CONSUMER_INFORMATION')).toBe(true);
    expect(categories.has('PRIVACY_POLICY')).toBe(true);
  });

  it('emits expiring-soon for active documents nearing validUntil', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const signals = deriveOrgReadinessNotifications(
      baseState([
        {
          id: 't1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: soon,
        },
        {
          id: 'c1',
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'p1',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
      ]),
    );
    expect(signals.some((s) => s.eventType === LEGAL_NOTIFICATION_EVENT.DOCUMENT_EXPIRING_SOON)).toBe(
      true,
    );
  });

  it('clears integrity user alert when integrity is verified again', () => {
    const broken = deriveOrgReadinessNotifications(
      baseState([
        {
          id: 't1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'MISSING_OBJECT',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'c1',
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'p1',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
      ]),
    );
    const fixed = deriveOrgReadinessNotifications(
      baseState([
        {
          id: 't1',
          documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'c1',
          documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
        {
          id: 'p1',
          documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
          versionLabel: 'v1',
          status: 'ACTIVE',
          language: 'de',
          jurisdictionCountry: 'DE',
          scanStatus: 'SCAN_PASSED',
          integrityStatus: 'VERIFIED',
          validFrom: null,
          validUntil: null,
        },
      ]),
    );
    expect(broken.some((s) => s.eventType === LEGAL_NOTIFICATION_EVENT.INTEGRITY_CHECK_FAILED)).toBe(
      true,
    );
    expect(fixed.some((s) => s.eventType === LEGAL_NOTIFICATION_EVENT.INTEGRITY_CHECK_FAILED)).toBe(
      false,
    );
  });

  it('does not duplicate org gaps in bundle notifications', () => {
    const bundleSignals = deriveBundleNotifications({
      organizationId: ORG,
      bookingId: 'booking-1',
      bookingRef: 'B-1001',
      completeness: {
        status: BUNDLE_COMPLETENESS_STATUS.INCOMPLETE,
        legacyBundleStatus: BUNDLE_STATUS.PARTIAL,
        missingItems: [],
        blockingReasons: [],
        nonBlockingWarnings: [],
        evaluatedAt: new Date().toISOString(),
        resolverVersion: 'v1',
        affectedDocumentTypes: [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
        phases: [],
        legal: {} as never,
        orgConfigurationGaps: [DOCUMENT_TYPE.TERMS_AND_CONDITIONS],
        cumulativeRequiredTypes: [],
        presentTypes: [],
      },
    });
    expect(bundleSignals).toHaveLength(0);
  });

  it('emits booking-level bundle incomplete when org templates exist', () => {
    const bundleSignals = deriveBundleNotifications({
      organizationId: ORG,
      bookingId: 'booking-2',
      bookingRef: 'B-1002',
      completeness: {
        status: BUNDLE_COMPLETENESS_STATUS.BLOCKED,
        legacyBundleStatus: BUNDLE_STATUS.PARTIAL,
        missingItems: [
          {
            documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
            humanReadableLabel: 'Mietvertrag',
            reason: 'not_generated',
            blocking: true,
            scopeExempt: false,
          },
        ],
        blockingReasons: [],
        nonBlockingWarnings: [],
        evaluatedAt: new Date().toISOString(),
        resolverVersion: 'v1',
        affectedDocumentTypes: [DOCUMENT_TYPE.RENTAL_CONTRACT],
        phases: [],
        legal: {} as never,
        orgConfigurationGaps: [],
        cumulativeRequiredTypes: [],
        presentTypes: [],
      },
    });
    expect(bundleSignals[0]).toMatchObject({
      eventType: LEGAL_NOTIFICATION_EVENT.BUNDLE_INCOMPLETE,
      entityType: NotificationEntityType.BOOKING,
      entityId: 'booking-2',
    });
  });
});
