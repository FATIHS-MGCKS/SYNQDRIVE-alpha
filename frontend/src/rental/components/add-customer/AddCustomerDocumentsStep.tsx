import type { ComponentType, ReactNode } from 'react';
import { Car, IdCard } from 'lucide-react';
import { Icon } from '../ui/Icon';
import { CustomerDocumentUploadBox } from '../CustomerDocumentUploadBox';
import { CustomerVerificationPanel } from '../customer-verification/CustomerVerificationPanel';
import type { PendingCustomerDocumentFiles } from '../../lib/entityMappers';

interface AddCustomerDocumentsStepProps {
  draftCustomerId: string | null;
  isPreparingDraft?: boolean;
  orgId?: string;
  idType: string;
  pendingDocFiles: PendingCustomerDocumentFiles;
  formErrors: Record<string, string>;
  onPendingFileChange: (
    type: keyof PendingCustomerDocumentFiles,
    file: File | null,
  ) => void;
  onVerificationUpdated?: () => void;
  sectionTitle: (icon: ComponentType<{ className?: string }>, title: string) => ReactNode;
}

export function AddCustomerDocumentsStep({
  draftCustomerId,
  isPreparingDraft = false,
  orgId,
  idType,
  pendingDocFiles,
  formErrors,
  onPendingFileChange,
  onVerificationUpdated,
  sectionTitle,
}: AddCustomerDocumentsStepProps) {
  return (
    <div className="space-y-5">
      {isPreparingDraft && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <Icon name="loader-2" className="h-4 w-4 animate-spin" />
          Kundendaten werden vorbereitet…
        </div>
      )}

      {draftCustomerId && !isPreparingDraft && (
        <CustomerVerificationPanel
          customerId={draftCustomerId}
          orgId={orgId}
          compact
          onVerificationUpdated={onVerificationUpdated}
        />
      )}

      {draftCustomerId && !isPreparingDraft && (
        <div className="relative flex items-center py-1">
          <div className="h-px flex-1 bg-border" />
          <span className="px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            oder manuell hochladen
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      {sectionTitle(IdCard, `${idType} hochladen`)}
      <div className="grid grid-cols-2 gap-3">
        <CustomerDocumentUploadBox
          label="Vorderseite *"
          documentType="ID_FRONT"
          orgId={orgId}
          pendingFile={pendingDocFiles.ID_FRONT}
          errorMessage={formErrors.idFront}
          onPendingFileChange={(file) => onPendingFileChange('ID_FRONT', file)}
        />
        <CustomerDocumentUploadBox
          label="Rückseite *"
          documentType="ID_BACK"
          orgId={orgId}
          pendingFile={pendingDocFiles.ID_BACK}
          errorMessage={formErrors.idBack}
          onPendingFileChange={(file) => onPendingFileChange('ID_BACK', file)}
        />
      </div>

      <div className="h-px my-1 bg-border" />
      {sectionTitle(Car, 'Führerschein hochladen')}
      <div className="grid grid-cols-2 gap-3">
        <CustomerDocumentUploadBox
          label="Vorderseite *"
          documentType="LICENSE_FRONT"
          orgId={orgId}
          pendingFile={pendingDocFiles.LICENSE_FRONT}
          errorMessage={formErrors.licenseFront}
          onPendingFileChange={(file) => onPendingFileChange('LICENSE_FRONT', file)}
        />
        <CustomerDocumentUploadBox
          label="Rückseite (optional)"
          documentType="LICENSE_BACK"
          orgId={orgId}
          pendingFile={pendingDocFiles.LICENSE_BACK}
          onPendingFileChange={(file) => onPendingFileChange('LICENSE_BACK', file)}
        />
      </div>
    </div>
  );
}
