import { useRentalOrg } from '../../rental/RentalContext';

import type { HandoverDialogBookingInfo } from '../../rental/components/handover/HandoverProtocolDialog';

import { OperatorBookingDocumentsPanel } from '../documents/OperatorBookingDocumentsPanel';

import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';

import { OperatorToggleRow } from './operatorHandoverUi';



interface Props {
  booking: HandoverDialogBookingInfo;
  form: OperatorHandoverFormApi;
  kind: 'PICKUP' | 'RETURN';
  onAiUpload?: () => void;
  fieldErrors?: Record<string, string>;
}

const DOCUMENTS_ACK_LABEL =
  'Mietvertrag, Fahrzeugschein und Übergabedokumente wurden mit dem Kunden durchgesprochen.';

export function OperatorHandoverStepDocuments({
  booking,
  form,
  kind,
  onAiUpload,
  fieldErrors,
}: Props) {

  const { orgId } = useRentalOrg();



  return (

    <div className="space-y-4">

      <OperatorBookingDocumentsPanel

        key={form.documentsReloadKey}

        orgId={orgId}

        bookingId={booking.id}

        customerId={booking.customerId ?? undefined}
        process={kind}
        onAiUpload={onAiUpload}

      />



      <OperatorToggleRow

        label={DOCUMENTS_ACK_LABEL}

        checked={form.state.checks.documentsAcknowledged}

        onChange={() => form.toggleCheck('documentsAcknowledged')}

      />

      {!form.state.checks.documentsAcknowledged && (
        <p
          className={`text-xs ${
            fieldErrors?.documentsAcknowledged
              ? 'text-[color:var(--status-critical)]'
              : 'text-muted-foreground'
          }`}
          role={fieldErrors?.documentsAcknowledged ? 'alert' : undefined}
        >
          {fieldErrors?.documentsAcknowledged ??
            'Pflichtbestätigung — ohne Häkchen kein Abschluss der Übergabe.'}
        </p>
      )}

    </div>

  );

}

