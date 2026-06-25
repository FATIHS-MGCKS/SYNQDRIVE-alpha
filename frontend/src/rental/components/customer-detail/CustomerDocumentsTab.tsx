import { Icon } from '../ui/Icon';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import { CustomerDocumentUploadBox } from '../CustomerDocumentUploadBox';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../../lib/entityMappers';
import type { CustomerDetail, KycDocSlot } from './customerDetailTypes';
import { EM_DASH, formatDate, formatDateTime, hasLegacyDocumentsOnly, resolveDocumentPreviewUrl } from './customerDetailUtils';

const cardBg = 'rounded-lg border border-border bg-card';

interface CustomerDocumentsTabProps {
  orgId: string | undefined;
  customerId: string;
  detail: CustomerDetail | null;
  kycDocSlots: KycDocSlot[];
  documentsLoading?: boolean;
  documentsError?: string | null;
  reviewingDocId: string | null;
  onDocumentUploaded: () => void;
  onVerify: (documentId: string) => void;
  onReject: (documentId: string) => void;
  onVerificationUpdated?: () => void;
}

export function CustomerDocumentsTab({
  orgId,
  customerId,
  detail,
  kycDocSlots,
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

  return (
    <div className="space-y-4">
      <CustomerVerificationPanel
        customerId={customerId}
        orgId={orgId}
        allowManualDocumentReview
        pendingReviewDocumentIds={pendingReviewDocumentIds}
        onManualVerifyDocument={onVerify}
        onDocumentUploaded={onDocumentUploaded}
        onVerificationUpdated={onVerificationUpdated}
      />

      <div className={`${cardBg} p-4`}>
        <h4 className="text-xs font-bold mb-3">Dokumentenstatus (Read-Model)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-border">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Personalausweis</span>
              <StatusChip tone={verificationTone(idUi)}>{customerVerificationUiLabelDe(idUi)}</StatusChip>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Nr. {detail?.idNumber || EM_DASH} · gültig bis {formatDate(detail?.idExpiry)}
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Führerschein</span>
              <StatusChip tone={verificationTone(licenseUi)}>
                {customerVerificationUiLabelDe(licenseUi)}
              </StatusChip>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Nr. {detail?.licenseNumber || EM_DASH} · gültig bis {formatDate(detail?.licenseExpiry)}
            </p>
          </div>
        </div>
      </div>

      {documentsError && (
        <div className="rounded-lg p-3 text-xs sq-tone-critical">{documentsError}</div>
      )}

      {showLegacy && (
        <div className="rounded-lg p-3 text-xs sq-tone-warning border border-current/30">
          <Icon name="alert-triangle" className="w-4 h-4 inline mr-1" />
          Legacy-Dokumente vorhanden (alte URL-Felder). Bitte im neuen Dokumentensystem erneut hochladen.
        </div>
      )}

      <div className={`${cardBg} p-4`}>
        <h4 className="text-xs font-bold mb-3">Dokumente hochladen</h4>
        {documentsLoading ? (
          <p className="text-xs text-muted-foreground">Dokumente werden geladen…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {kycDocSlots.map((doc) => (
              <div key={doc.slot}>
                <CustomerDocumentUploadBox
                  label={doc.label}
                  documentType={doc.documentType}
                  orgId={orgId}
                  customerId={customerId}
                  document={doc.document}
                  legacyPreviewUrl={doc.document ? null : doc.legacyPreviewUrl}
                  onDocumentUploaded={onDocumentUploaded}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Status: {doc.statusLabel}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${cardBg} overflow-hidden`}>
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Dokument', 'Status', 'Hochgeladen', 'Geprüft', 'Ablauf', 'Aktionen'].map((h) => (
                <th key={h} className="text-left text-[10px] uppercase tracking-wider font-semibold px-3 py-2 text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {kycDocSlots.map((doc) => {
              const previewUrl = resolveDocumentPreviewUrl(
                doc.document?.fileKey,
                doc.legacyPreviewUrl,
              );
              const canReview =
                doc.document &&
                ['UPLOADED', 'PENDING_REVIEW'].includes(doc.document.status);
              const rejectedReason = (doc.document as { rejectedReason?: string } | null)?.rejectedReason;
              return (
                <tr key={doc.slot} className="hover:bg-muted/30">
                  <td className="px-3 py-2 text-xs font-medium">{doc.label}</td>
                  <td className="px-3 py-2 text-xs">{doc.statusLabel}</td>
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    {doc.document?.createdAt ? formatDateTime(doc.document.createdAt) : EM_DASH}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    {doc.document?.reviewedAt ? formatDateTime(doc.document.reviewedAt) : EM_DASH}
                  </td>
                  <td className="px-3 py-2 text-[10px] text-muted-foreground">
                    {doc.document?.expiresAt ? formatDate(doc.document.expiresAt) : EM_DASH}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {previewUrl && (
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded text-[10px] font-semibold sq-tone-info"
                        >
                          Ansehen
                        </a>
                      )}
                      {canReview && doc.document && (
                        <>
                          <button
                            type="button"
                            disabled={reviewingDocId === doc.document.id}
                            onClick={() => onVerify(doc.document!.id)}
                            className="px-2 py-1 rounded text-[10px] font-semibold sq-tone-success"
                          >
                            Verifizieren
                          </button>
                          <button
                            type="button"
                            disabled={reviewingDocId === doc.document.id}
                            onClick={() => onReject(doc.document!.id)}
                            className="px-2 py-1 rounded text-[10px] font-semibold sq-tone-critical"
                          >
                            Ablehnen
                          </button>
                        </>
                      )}
                    </div>
                    {rejectedReason && (
                      <p className="text-[10px] text-[color:var(--status-critical)] mt-1">{rejectedReason}</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
