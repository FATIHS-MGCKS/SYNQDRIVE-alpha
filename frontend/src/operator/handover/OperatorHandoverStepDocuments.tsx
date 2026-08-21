import { useRentalOrg } from '../../rental/RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import type { HandoverDialogBookingInfo } from '../../rental/components/handover/HandoverProtocolDialog';
import { OperatorBookingDocumentsPanel } from '../documents/OperatorBookingDocumentsPanel';
import type { OperatorHandoverFormApi } from './useOperatorHandoverForm';
import { oh } from './operator-handover-i18n';
import { OperatorToggleRow } from './operatorHandoverUi';

interface Props {
  booking: HandoverDialogBookingInfo;
  form: OperatorHandoverFormApi;
  onAiUpload?: () => void;
}

export function OperatorHandoverStepDocuments({ booking, form, onAiUpload }: Props) {
  const { orgId } = useRentalOrg();
  const { locale } = useLanguage();

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
        label={oh(locale, 'handover.operator.documents.ackShort')}
        checked={form.state.checks.documentsAcknowledged}
        onChange={() => form.toggleCheck('documentsAcknowledged')}
      />

      {!form.state.checks.documentsAcknowledged && (
        <p className="text-xs text-muted-foreground">
          {oh(locale, 'handover.operator.documents.ackRequired')}
        </p>
      )}
    </div>
  );
}
