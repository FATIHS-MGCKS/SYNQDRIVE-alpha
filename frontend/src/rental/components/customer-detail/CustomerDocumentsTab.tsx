import { ExternalLink } from 'lucide-react';

import { Icon } from '../ui/Icon';
import { DataCard, StatusChip } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { CustomerDocumentUploadBox } from '../CustomerDocumentUploadBox';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../../lib/entityMappers';
import type { CustomerDetail, KycDocSlot } from './customerDetailTypes';
import {
  EM_DASH,
  formatDate,
  formatDocumentVerificationMeta,
  formatKycIdentityDocumentLabel,
  formatKycLicenseDocumentLabel,
  findPendingKycDocument,
  findPrimaryKycDocument,
  hasLegacyDocumentsOnly,
  kycSlotNeedsUpload,
  licenseVerificationHint,
  resolveDocumentPreviewUrl,
} from './customerDetailUtils';
import { cdv } from './customer-detail-ui';

interface CustomerDocumentsTabProps {
  orgId: string | undefined;
  customerId: string;
  detail: CustomerDetail | null;
  kycDocSlots: KycDocSlot[];
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

export function CustomerDocumentsTab({
  orgId,
  customerId,
  detail,
  kycDocSlots,
  eligibilityBlockingReasons,
  documentsLoading,
  documentsError,
  reviewingDocId,
  onDocumentUploaded,
  onVerify,
  onReject,
  onVerificationUpdated,
}: CustomerDocumentsTabProps) {
  const idUi = customerVerificationApiToUi(detail?.idVerificationStatus ?? undefined);
  const licenseUi = customerVerificationApiToUi(detail?.licenseVerificationStatus ?? undefined);
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

  const missingUploadSlots = kycDocSlots.filter((slot) =>
    kycSlotNeedsUpload(slot, { replaceLegacy: showLegacy }),
  );

  const verificationHint = licenseVerificationHint(licenseUi, eligibilityBlockingReasons);

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
            title={formatKycIdentityDocumentLabel(detail)}
            verificationUi={idUi}
            number={detail?.idNumber}
            expiry={detail?.idExpiry}
            meta={formatDocumentVerificationMeta(idPrimaryDoc, idUi)}
            pendingDoc={idPendingDoc}
            previewUrl={resolveDocumentPreviewUrl(idPrimaryDoc?.fileKey, null)}
            reviewingDocId={reviewingDocId}
            onVerify={onVerify}
            onReject={onReject}
            emptyHint={idUi === 'Not Submitted' ? 'Noch kein Ausweisdokument eingereicht' : undefined}
          />
          <DocumentStatusCard
            title={formatKycLicenseDocumentLabel(detail)}
            verificationUi={licenseUi}
            number={detail?.licenseNumber}
            expiry={detail?.licenseExpiry}
            meta={formatDocumentVerificationMeta(licensePrimaryDoc, licenseUi)}
            pendingDoc={licensePendingDoc}
            previewUrl={resolveDocumentPreviewUrl(licensePrimaryDoc?.fileKey, null)}
            reviewingDocId={reviewingDocId}
            onVerify={onVerify}
            onReject={onReject}
            emptyHint={
              licenseUi === 'Not Submitted'
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
  verificationUi,
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
  verificationUi: ReturnType<typeof customerVerificationApiToUi>;
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
  const rejectedReason = (pendingDoc as { rejectedReason?: string } | null)?.rejectedReason;

  return (
    <div className={cdv.documentsStatusCard}>
      <div className={cdv.documentsStatusHeader}>
        <div className="min-w-0">
          <p className={cdv.documentsStatusTitle}>{title}</p>
          <p className={cdv.documentsStatusMeta}>
            Nr. {number || EM_DASH} · gültig bis {formatDate(expiry)}
          </p>
        </div>
        <StatusChip tone={verificationTone(verificationUi)} dot className={cdv.decisionChip}>
          {customerVerificationUiLabelDe(verificationUi)}
        </StatusChip>
      </div>

      {meta ? <p className={cdv.documentsStatusMeta}>{meta}</p> : null}
      {emptyHint && verificationUi === 'Not Submitted' ? (
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

function verificationTone(
  ui: ReturnType<typeof customerVerificationApiToUi>,
): 'success' | 'warning' | 'critical' | 'neutral' {
  if (ui === 'Verified') return 'success';
  if (ui === 'Pending Review') return 'warning';
  if (ui === 'Rejected' || ui === 'Expired') return 'critical';
  return 'neutral';
}
