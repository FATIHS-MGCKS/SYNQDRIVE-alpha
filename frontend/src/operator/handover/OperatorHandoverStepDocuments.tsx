import { useRentalOrg } from '../../rental/RentalContext';

import type { HandoverDialogBookingInfo } from '../../rental/components/handover/HandoverProtocolDialog';

import { OperatorBookingDocumentsPanel } from '../documents/OperatorBookingDocumentsPanel';

import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';

import { OperatorToggleRow } from './operatorHandoverUi';



interface Props {

  booking: HandoverDialogBookingInfo;

  form: OperatorHandoverFormApi;

  onAiUpload?: () => void;

}



const DOCUMENTS_ACK_LABEL =

  'Mietvertrag, Fahrzeugschein und Übergabedokumente wurden mit dem Kunden durchgesprochen.';



export function OperatorHandoverStepDocuments({ booking, form, onAiUpload }: Props) {

  const { orgId } = useRentalOrg();



  return (

    <div className="space-y-4">

      <OperatorBookingDocumentsPanel

        key={form.documentsReloadKey}

        orgId={orgId}

        bookingId={booking.id}

        customerId={booking.customerId ?? undefined}

        onAiUpload={onAiUpload}

      />



      <OperatorToggleRow

        label={DOCUMENTS_ACK_LABEL}

        checked={form.state.checks.documentsAcknowledged}

        onChange={() => form.toggleCheck('documentsAcknowledged')}

      />

      {!form.state.checks.documentsAcknowledged && (

        <p className="text-xs text-muted-foreground">

          Pflichtbestätigung — ohne Häkchen kein Abschluss der Übergabe.

        </p>

      )}

    </div>

  );

}

