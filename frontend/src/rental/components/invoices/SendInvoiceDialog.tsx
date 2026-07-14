import { SendDocumentsEmailModal } from '../../../components/email/SendDocumentsEmailModal';
import type { GeneratedDocumentDto } from '../../../lib/api';
import { displayNumber } from './invoiceFormatters';
import type { Invoice } from './invoiceTypes';

interface SendInvoiceDialogProps {
  invoice: Invoice;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sendDoc: GeneratedDocumentDto | null;
  defaultToEmail: string | null;
  onSent: () => void;
}

export function SendInvoiceDialog({
  invoice,
  orgId,
  open,
  onOpenChange,
  sendDoc,
  defaultToEmail,
  onSent,
}: SendInvoiceDialogProps) {
  if (!invoice.bookingId || !sendDoc) return null;

  return (
    <SendDocumentsEmailModal
      open={open}
      onOpenChange={onOpenChange}
      orgId={orgId}
      bookingId={invoice.bookingId}
      bookingNumber={displayNumber(invoice)}
      defaultToEmail={defaultToEmail}
      documents={[sendDoc]}
      preselectedDocumentIds={[sendDoc.id]}
      onSent={onSent}
    />
  );
}
