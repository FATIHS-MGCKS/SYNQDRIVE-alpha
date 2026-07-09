import { useState } from 'react';
import { StatusChip, type StatusTone } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { useRentalOrg } from '../../RentalContext';
import { Icon } from '../ui/Icon';
import { CustomerDocumentUploadBox } from '../CustomerDocumentUploadBox';
import {
  diditAutoCheckButtonLabel,
  documentEligibilityLabelDe,
  documentEligibilityTone,
  proofOfAddressEligibilityLabelDe,
  proofOfAddressEligibilityTone,
  VERIFICATION_KIND_LABELS,
  type CustomerVerificationCheckKind,
} from '../../lib/customer-verification';
import { DiditConsentNotice } from './DiditConsentNotice';
import { useCustomerVerification } from './useCustomerVerification';

interface CustomerVerificationPanelProps {
  customerId: string;
  bookingId?: string;
  orgId?: string;
  compact?: boolean;
  allowManualDocumentReview?: boolean;
  onManualVerifyDocument?: (documentId: string) => void;
  pendingReviewDocumentIds?: string[];
  onVerificationUpdated?: () => void;
  onDocumentUploaded?: () => void;
  getDiditActionLabel?: (kind: CustomerVerificationCheckKind) => string;
}

export function CustomerVerificationPanel({
  customerId,
  bookingId,
  orgId,
  compact = false,
  allowManualDocumentReview = false,
  onManualVerifyDocument,
  pendingReviewDocumentIds = [],
  onVerificationUpdated,
  onDocumentUploaded,
  getDiditActionLabel,
}: CustomerVerificationPanelProps) {
  const { hasPermission } = useRentalOrg();
  const canManageCustomers = hasPermission('customers', 'manage');
  const {
    eligibility,
    loading,
    error,
    startingKind,
    refresh,
    startDiditCheck,
  } = useCustomerVerification(customerId, bookingId);

  const [pendingKind, setPendingKind] = useState<CustomerVerificationCheckKind | null>(null);
  const resolveDiditLabel = getDiditActionLabel ?? diditAutoCheckButtonLabel;

  const handleRefresh = async () => {
    await refresh();
    onVerificationUpdated?.();
  };

  const confirmDiditStart = async () => {
    if (!pendingKind) return;
    await startDiditCheck(pendingKind);
    setPendingKind(null);
    await handleRefresh();
  };

  const showPoAUpload =
    eligibility &&
    eligibility.proofOfAddress !== 'not_required' &&
    eligibility.proofOfAddress !== 'verified';

  if (!customerId) return null;

  return (
    <div className={`rounded-lg border border-border surface-premium ${compact ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold">Dokumentenprüfung</h4>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading}
          className="text-[10px] font-semibold text-[color:var(--brand)] disabled:opacity-50"
        >
          {loading ? 'Lädt…' : 'Aktualisieren'}
        </button>
      </div>

      {error && <p className="text-[11px] text-[color:var(--status-critical)]">{error}</p>}

      {eligibility && (
        <div className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
          <VerificationStatusRow
            label={VERIFICATION_KIND_LABELS.ID_DOCUMENT}
            statusLabel={documentEligibilityLabelDe(eligibility.idDocument)}
            tone={documentEligibilityTone(eligibility.idDocument)}
          />
          <VerificationStatusRow
            label={VERIFICATION_KIND_LABELS.DRIVING_LICENSE}
            statusLabel={documentEligibilityLabelDe(eligibility.drivingLicense)}
            tone={documentEligibilityTone(eligibility.drivingLicense)}
          />
          <VerificationStatusRow
            label={VERIFICATION_KIND_LABELS.PROOF_OF_ADDRESS}
            statusLabel={proofOfAddressEligibilityLabelDe(eligibility.proofOfAddress)}
            tone={proofOfAddressEligibilityTone(eligibility.proofOfAddress)}
          />
        </div>
      )}

      {(eligibility?.blockingReasons.length ?? 0) > 0 && (
        <ul className="text-[11px] text-[color:var(--status-critical)] space-y-0.5 list-disc pl-4">
          {eligibility!.blockingReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {(eligibility?.warnings.length ?? 0) > 0 && (
        <ul className="text-[11px] text-[color:var(--status-attention)] space-y-0.5 list-disc pl-4">
          {eligibility!.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {pendingKind ? (
        <DiditConsentNotice
          busy={startingKind === pendingKind}
          onConfirm={() => void confirmDiditStart()}
          onCancel={() => setPendingKind(null)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {(['ID_DOCUMENT', 'DRIVING_LICENSE'] as const).map((kind) => {
            const status =
              kind === 'ID_DOCUMENT'
                ? eligibility?.idDocument
                : eligibility?.drivingLicense;
            const canStart =
              status !== 'verified' && status !== 'pending' && startingKind !== kind;
            return (
              <ActionButton
                key={kind}
                disabled={!canStart || loading}
                busy={startingKind === kind}
                onClick={() => setPendingKind(kind)}
                label={resolveDiditLabel(kind)}
              />
            );
          })}
          {eligibility?.proofOfAddress !== 'not_required' &&
            eligibility?.proofOfAddress !== 'verified' && (
              <ActionButton
                disabled={
                  eligibility?.proofOfAddress === 'pending' ||
                  loading ||
                  startingKind === 'PROOF_OF_ADDRESS'
                }
                busy={startingKind === 'PROOF_OF_ADDRESS'}
                onClick={() => setPendingKind('PROOF_OF_ADDRESS')}
                label={resolveDiditLabel('PROOF_OF_ADDRESS')}
              />
            )}
        </div>
      )}

      {showPoAUpload && orgId && (
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground mb-2">Adressnachweis hochladen</p>
          <CustomerDocumentUploadBox
            label="Adressnachweis (z. B. Meldebescheinigung)"
            documentType="PROOF_OF_ADDRESS"
            orgId={orgId}
            customerId={customerId}
            onDocumentUploaded={() => {
              onDocumentUploaded?.();
              void handleRefresh();
            }}
          />
        </div>
      )}

      {allowManualDocumentReview &&
        canManageCustomers &&
        pendingReviewDocumentIds.length > 0 &&
        onManualVerifyDocument && (
          <div className="pt-2 border-t border-border">
            <p className="text-[11px] text-muted-foreground mb-2">Manuelle Prüfung (berechtigte Rollen)</p>
            <button
              type="button"
              onClick={() => onManualVerifyDocument(pendingReviewDocumentIds[0]!)}
              className="px-3 py-2 rounded-lg text-xs font-semibold sq-tone-success"
            >
              Manuell als geprüft markieren
            </button>
          </div>
        )}

      {(eligibility?.idDocument === 'pickup_required' ||
        eligibility?.drivingLicense === 'pickup_required') && (
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Prüfung beim Pickup: Die operative Dokumentenprüfung erfolgt bei der Fahrzeugübergabe durch
          das Team vor Ort.
        </p>
      )}
    </div>
  );
}

function VerificationStatusRow({
  label,
  statusLabel,
  tone,
}: {
  label: string;
  statusLabel: string;
  tone: StatusTone;
}) {
  return (
    <div className="p-2.5 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <StatusChip tone={tone}>{statusLabel}</StatusChip>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  busy,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="neutral"
      disabled={disabled}
      onClick={onClick}
      className="h-9"
    >
      {busy ? (
        <Icon name="loader-2" className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Icon name="shield" className="w-3.5 h-3.5" />
      )}
      {label}
    </Button>
  );
}
