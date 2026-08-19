import { ExternalLink } from 'lucide-react';

import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { DataCard, StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { CustomerDocumentUploadBox } from '../CustomerDocumentUploadBox';
import { DocumentIntakeLaunchAiButton } from '../documents/DocumentIntakeLaunchButton';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import type { CustomerDocumentDomainStatus, CustomerDocumentVerificationStatusDto } from '../../../lib/api';
import type { CustomerDetail, KycDocSlot } from './customerDetailTypes';
import {
  customerVerificationUiLabel,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import {
  EM_DASH,
  formatDate,
  formatDateTime,
  findPendingKycDocument,
  findPrimaryKycDocument,
  hasLegacyDocumentsOnly,
  licenseVerificationHint,
  mapMissingUploadSlotsFromBackend,
  resolveDocumentPreviewUrl,
} from './customerDetailUtils';
import { cdv } from './customer-detail-ui';

interface CustomerDocumentsTabProps {
  orgId: string | undefined;
  customerId: string;
  detail: CustomerDetail | null;
  kycDocSlots: KycDocSlot[];
  documentStatus: CustomerDocumentVerificationStatusDto | null;
  eligibilityBlockingReasons?: string[];
  documentsLoading?: boolean;
  documentsError?: string | null;
  reviewingDocId: string | null;
  onDocumentUploaded: () => void;
  onVerify: (documentId: string) => void;
  onReject: (documentId: string) => void;
  onVerificationUpdated?: () => void;
}

const ID_DOC_TYPES = ['ID_FRONT', 'ID_BACK'] as const;
const LICENSE_DOC_TYPES = ['LICENSE_FRONT', 'LICENSE_BACK'] as const;

function customerDetailDiditActionLabel(
  kind: 'ID_DOCUMENT' | 'DRIVING_LICENSE' | 'PROOF_OF_ADDRESS',
  t: (key: import('../../../i18n/translations/en').TranslationKey) => string,
): string {
  switch (kind) {
    case 'ID_DOCUMENT':
      return t('customers.verification.diditAction.id');
    case 'DRIVING_LICENSE':
      return t('customers.verification.diditAction.license');
    case 'PROOF_OF_ADDRESS':
      return t('customers.verification.diditAction.poa');
  }
}

function domainStatusLabel(
  status: CustomerDocumentDomainStatus['status'],
  t: (key: import('../../../i18n/translations/en').TranslationKey) => string,
): string {
  switch (status) {
    case 'VERIFIED':
      return t('customers.verification.verified');
    case 'PENDING_REVIEW':
      return t('customers.verification.pendingReview');
    case 'REJECTED':
      return t('customers.verification.rejected');
    case 'EXPIRED':
      return t('customers.verification.expired');
    case 'NOT_REQUIRED':
      return t('customers.eligibility.notRequired');
    default:
      return t('customers.verification.notSubmitted');
  }
}

function domainStatusTone(
  status: CustomerDocumentDomainStatus['status'],
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (status === 'VERIFIED') return 'success';
  if (status === 'PENDING_REVIEW') return 'warning';
  if (status === 'REJECTED' || status === 'EXPIRED') return 'critical';
  return 'neutral';
}

function formatDomainStatusMeta(
  domain: CustomerDocumentDomainStatus,
  t: (key: import('../../../i18n/translations/en').TranslationKey, vars?: Record<string, string | number>) => string,
): string | null {
  const parts: string[] = [];
  if (domain.provider === 'DIDIT') parts.push(t('customers.detail.documents.verifiedViaDidit'));
  else if (domain.provider === 'MANUAL') parts.push(t('customers.detail.documents.verifiedManually'));
  if (domain.checkedByName) parts.push(domain.checkedByName);
  if (domain.submittedAt) parts.push(t('customers.detail.documents.submittedAt', { date: formatDateTime(domain.submittedAt) }));
  if (domain.verifiedAt) parts.push(t('customers.detail.documents.verifiedAt', { date: formatDateTime(domain.verifiedAt) }));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function CustomerDocumentsTab({
  orgId,
  customerId,
  detail,
  kycDocSlots,
  documentStatus,
  eligibilityBlockingReasons,
  documentsLoading,
  documentsError,
  reviewingDocId,
  onDocumentUploaded,
  onVerify,
  onReject,
  onVerificationUpdated,
}: CustomerDocumentsTabProps) {
  const { t } = useLanguage();
  const showLegacy = hasLegacyDocumentsOnly(detail) && kycDocSlots.every((s) => !s.document);

  const pendingReviewDocumentIds = kycDocSlots
    .map((s) => s.document)
    .filter(
      (doc): doc is NonNullable<typeof doc> =>
        Boolean(doc && ['UPLOADED', 'PENDING_REVIEW'].includes(doc.status)),
    )
    .map((doc) => doc.id);

  const idPrimaryDoc = findPrimaryKycDocument(kycDocSlots, [...ID_DOC_TYPES]);
  const licensePrimaryDoc = findPrimaryKycDocument(kycDocSlots, [...LICENSE_DOC_TYPES]);
  const idPendingDoc = findPendingKycDocument(kycDocSlots, [...ID_DOC_TYPES]);
  const licensePendingDoc = findPendingKycDocument(kycDocSlots, [...LICENSE_DOC_TYPES]);

  const missingUploadSlots = mapMissingUploadSlotsFromBackend(
    documentStatus?.missingUploadSlots,
    kycDocSlots,
    showLegacy,
  );

  const idDomain = documentStatus?.idDocument;
  const licenseDomain = documentStatus?.drivingLicense;
  const verificationHint = licenseVerificationHint(
    domainStatusLabel(licenseDomain?.status ?? 'NOT_SUBMITTED', t),
    eligibilityBlockingReasons,
  );

  return (
    <div className={cdv.documentsSection}>
      <CustomerVerificationPanel
        customerId={customerId}
        orgId={orgId}
        allowManualDocumentReview
        pendingReviewDocumentIds={pendingReviewDocumentIds}
        onManualVerifyDocument={onVerify}
        onDocumentUploaded={onDocumentUploaded}
        onVerificationUpdated={onVerificationUpdated}
        getDiditActionLabel={(kind) => customerDetailDiditActionLabel(kind, t)}
      />

      <div className={cdv.documentsUploadSection}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-xs font-bold">{t('customers.detail.documents.opsTitle')}</h4>
            <p className="text-[11px] text-muted-foreground mt-1">
              {t('customers.detail.documents.opsHint')}
            </p>
          </div>
          <DocumentIntakeLaunchAiButton
            label={t('customers.detail.documents.aiUpload')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-semibold"
            request={{
              optionalContextType: 'CUSTOMER',
              optionalContextId: customerId,
              sourceSurface: 'customer_detail',
              returnView: 'customer-detail',
              returnEntityId: customerId,
              documentTab: 'upload',
            }}
          />
        </div>
      </div>

      <DataCard title={t('customers.detail.documents.statusTitle')} bodyClassName="py-3.5">
        <div className={cdv.documentsStatusGrid}>
          <DocumentStatusCard
            title={idDomain?.displayName ?? t('customers.wizard.idCard')}
            domainStatus={idDomain}
            number={idDomain?.documentNumber ?? detail?.idNumber}
            expiry={detail?.idExpiry}
            meta={idDomain ? formatDomainStatusMeta(idDomain, t) : null}
            pendingDoc={idPendingDoc}
            previewUrl={resolveDocumentPreviewUrl(idPrimaryDoc?.fileKey, null)}
            reviewingDocId={reviewingDocId}
            onVerify={onVerify}
            onReject={onReject}
            emptyHint={
              idDomain?.status === 'NOT_SUBMITTED'
                ? t('customers.detail.documents.noIdYet')
                : undefined
            }
            t={t}
          />
          <DocumentStatusCard
            title={licenseDomain?.displayName ?? t('customers.wizard.license')}
            domainStatus={licenseDomain}
            number={licenseDomain?.documentNumber ?? detail?.licenseNumber}
            expiry={detail?.licenseExpiry}
            meta={licenseDomain ? formatDomainStatusMeta(licenseDomain, t) : null}
            pendingDoc={licensePendingDoc}
            previewUrl={resolveDocumentPreviewUrl(licensePrimaryDoc?.fileKey, null)}
            reviewingDocId={reviewingDocId}
            onVerify={onVerify}
            onReject={onReject}
            emptyHint={
              licenseDomain?.status === 'NOT_SUBMITTED'
                ? verificationHint ?? t('customers.detail.documents.noLicenseYet')
                : verificationHint ?? undefined
            }
            t={t}
          />
        </div>
      </DataCard>

      {documentsError ? (
        <div className="rounded-lg p-3 text-xs sq-tone-critical">{documentsError}</div>
      ) : null}

      {showLegacy ? (
        <div className="rounded-lg p-3 text-xs sq-tone-warning border border-current/30">
          <Icon name="alert-triangle" className="w-4 h-4 inline mr-1" />
          {t('customers.detail.documents.legacyWarning')}
        </div>
      ) : null}

      {missingUploadSlots.length > 0 ? (
        <div className={cdv.documentsUploadSection}>
          <h4 className="text-xs font-bold">{t('customers.detail.documents.missingUpload')}</h4>
          {documentsLoading ? (
            <p className="text-xs text-muted-foreground">{t('customers.detail.documents.loading')}</p>
          ) : (
            <div className={cdv.documentsUploadGrid}>
              {missingUploadSlots.map((doc) => (
                <CustomerDocumentUploadBox
                  key={doc.slot}
                  label={doc.label}
                  documentType={doc.documentType}
                  orgId={orgId}
                  customerId={customerId}
                  document={doc.document}
                  legacyPreviewUrl={doc.document ? null : doc.legacyPreviewUrl}
                  onDocumentUploaded={onDocumentUploaded}
                />
              ))}
            </div>
          )}
        </div>
      ) : !documentsLoading ? (
        <p className={cdv.documentsEmptySuccess}>
          {t('customers.detail.documents.allPresent')}
        </p>
      ) : null}
    </div>
  );
}

function DocumentStatusCard({
  title,
  domainStatus,
  number,
  expiry,
  meta,
  pendingDoc,
  previewUrl,
  reviewingDocId,
  onVerify,
  onReject,
  emptyHint,
  t,
}: {
  title: string;
  domainStatus?: CustomerDocumentDomainStatus;
  number?: string | null;
  expiry?: string | null;
  meta?: string | null;
  pendingDoc: ReturnType<typeof findPendingKycDocument>;
  previewUrl: string | null;
  reviewingDocId: string | null;
  onVerify: (documentId: string) => void;
  onReject: (documentId: string) => void;
  emptyHint?: string;
  t: (key: import('../../../i18n/translations/en').TranslationKey, vars?: Record<string, string | number>) => string;
}) {
  const status = domainStatus?.status ?? 'NOT_SUBMITTED';
  const rejectedReason = domainStatus?.rejectedReason ?? pendingDoc?.rejectedReason;

  return (
    <div className={cdv.documentsStatusCard}>
      <div className={cdv.documentsStatusHeader}>
        <div className="min-w-0">
          <p className={cdv.documentsStatusTitle}>{title}</p>
          <p className={cdv.documentsStatusMeta}>
            {t('customers.detail.documents.numberValid', {
              number: number || EM_DASH,
              date: formatDate(expiry),
            })}
          </p>
        </div>
        <StatusChip tone={domainStatusTone(status)} dot className={cdv.decisionChip}>
          {domainStatusLabel(status, t)}
        </StatusChip>
      </div>

      {meta ? <p className={cdv.documentsStatusMeta}>{meta}</p> : null}
      {emptyHint && status === 'NOT_SUBMITTED' ? (
        <p className={cdv.documentsStatusMeta}>{emptyHint}</p>
      ) : null}

      {(pendingDoc || previewUrl) && (
        <div className={cdv.documentsStatusActions}>
          {previewUrl ? (
            <Button type="button" size="sm" variant="neutral" className="h-8" asChild>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                {t('customers.detail.documents.view')}
              </a>
            </Button>
          ) : null}
          {pendingDoc ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="success"
                className="h-8"
                disabled={reviewingDocId === pendingDoc.id}
                onClick={() => onVerify(pendingDoc.id)}
              >
                {t('customers.detail.documents.verify')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={reviewingDocId === pendingDoc.id}
                onClick={() => onReject(pendingDoc.id)}
              >
                {t('customers.detail.documents.reject')}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {rejectedReason ? (
        <p className="text-[11px] leading-snug text-[color:var(--status-critical)]">{rejectedReason}</p>
      ) : null}
    </div>
  );
}
