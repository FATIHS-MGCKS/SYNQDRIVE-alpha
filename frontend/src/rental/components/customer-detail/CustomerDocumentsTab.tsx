import { ExternalLink } from 'lucide-react';

import { Icon } from '../ui/Icon';
import { DataCard, StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { CustomerDocumentUploadBox } from '../CustomerDocumentUploadBox';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import type { CustomerDocumentDomainStatus, CustomerDocumentVerificationStatusDto } from '../../../lib/api';
import type { CustomerDetail, KycDocSlot } from './customerDetailTypes';
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

function customerDetailDiditActionLabel(kind: 'ID_DOCUMENT' | 'DRIVING_LICENSE' | 'PROOF_OF_ADDRESS'): string {
  switch (kind) {
    case 'ID_DOCUMENT':
      return 'KYC Ausweisprozess starten';
    case 'DRIVING_LICENSE':
      return 'KYC Führerscheinprozess starten';
    case 'PROOF_OF_ADDRESS':
      return 'KYC Adressnachweis starten';
  }
}

function domainStatusLabel(status: CustomerDocumentDomainStatus['status']): string {
  switch (status) {
    case 'VERIFIED':
      return 'Verifiziert';
    case 'PENDING_REVIEW':
      return 'In Prüfung';
    case 'REJECTED':
      return 'Abgelehnt';
    case 'EXPIRED':
      return 'Abgelaufen';
    case 'NOT_REQUIRED':
      return 'Nicht erforderlich';
    default:
      return 'Nicht eingereicht';
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

function formatDomainStatusMeta(domain: CustomerDocumentDomainStatus): string | null {
  const parts: string[] = [];
  if (domain.provider === 'DIDIT') parts.push('Geprüft über Didit');
  else if (domain.provider === 'MANUAL') parts.push('Geprüft durch Mitarbeiter');
  if (domain.checkedByName) parts.push(domain.checkedByName);
  if (domain.submittedAt) parts.push(`Eingereicht am ${formatDateTime(domain.submittedAt)}`);
  if (domain.verifiedAt) parts.push(`Verifiziert am ${formatDateTime(domain.verifiedAt)}`);
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
    domainStatusLabel(licenseDomain?.status ?? 'NOT_SUBMITTED'),
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
        getDiditActionLabel={customerDetailDiditActionLabel}
      />

      <DataCard title="Dokumentenstatus" bodyClassName="py-3.5">
        <div className={cdv.documentsStatusGrid}>
          <DocumentStatusCard
            title={idDomain?.displayName ?? 'Personalausweis'}
            domainStatus={idDomain}
            number={idDomain?.documentNumber ?? detail?.idNumber}
            expiry={detail?.idExpiry}
            meta={idDomain ? formatDomainStatusMeta(idDomain) : null}
            pendingDoc={idPendingDoc}
            previewUrl={resolveDocumentPreviewUrl(idPrimaryDoc?.fileKey, null)}
            reviewingDocId={reviewingDocId}
            onVerify={onVerify}
            onReject={onReject}
            emptyHint={
              idDomain?.status === 'NOT_SUBMITTED'
                ? 'Noch kein Ausweisdokument eingereicht'
                : undefined
            }
          />
          <DocumentStatusCard
            title={licenseDomain?.displayName ?? 'Führerschein'}
            domainStatus={licenseDomain}
            number={licenseDomain?.documentNumber ?? detail?.licenseNumber}
            expiry={detail?.licenseExpiry}
            meta={licenseDomain ? formatDomainStatusMeta(licenseDomain) : null}
            pendingDoc={licensePendingDoc}
            previewUrl={resolveDocumentPreviewUrl(licensePrimaryDoc?.fileKey, null)}
            reviewingDocId={reviewingDocId}
            onVerify={onVerify}
            onReject={onReject}
            emptyHint={
              licenseDomain?.status === 'NOT_SUBMITTED'
                ? verificationHint ?? 'Noch kein Führerscheindokument eingereicht'
                : verificationHint ?? undefined
            }
          />
        </div>
      </DataCard>

      {documentsError ? (
        <div className="rounded-lg p-3 text-xs sq-tone-critical">{documentsError}</div>
      ) : null}

      {showLegacy ? (
        <div className="rounded-lg p-3 text-xs sq-tone-warning border border-current/30">
          <Icon name="alert-triangle" className="w-4 h-4 inline mr-1" />
          Legacy-Dokumente vorhanden (alte URL-Felder). Bitte im neuen Dokumentensystem erneut hochladen.
        </div>
      ) : null}

      {missingUploadSlots.length > 0 ? (
        <div className={cdv.documentsUploadSection}>
          <h4 className="text-xs font-bold">Fehlende Dokumente hochladen</h4>
          {documentsLoading ? (
            <p className="text-xs text-muted-foreground">Dokumente werden geladen…</p>
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
          Alle erforderlichen Dokumente sind bereits vorhanden.
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
}) {
  const status = domainStatus?.status ?? 'NOT_SUBMITTED';
  const rejectedReason = domainStatus?.rejectedReason ?? pendingDoc?.rejectedReason;

  return (
    <div className={cdv.documentsStatusCard}>
      <div className={cdv.documentsStatusHeader}>
        <div className="min-w-0">
          <p className={cdv.documentsStatusTitle}>{title}</p>
          <p className={cdv.documentsStatusMeta}>
            Nr. {number || EM_DASH} · gültig bis {formatDate(expiry)}
          </p>
        </div>
        <StatusChip tone={domainStatusTone(status)} dot className={cdv.decisionChip}>
          {domainStatusLabel(status)}
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
                Ansehen
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
                Verifizieren
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={reviewingDocId === pendingDoc.id}
                onClick={() => onReject(pendingDoc.id)}
              >
                Ablehnen
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
