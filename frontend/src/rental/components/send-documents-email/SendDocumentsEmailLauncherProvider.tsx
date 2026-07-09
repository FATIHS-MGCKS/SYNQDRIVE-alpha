import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import { api, type GeneratedDocumentDto } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { SendDocumentsEmailModal } from './SendDocumentsEmailModal';
import { canSendDocumentsEmail } from './send-documents-email.permissions';
import type {
  SendDocumentsEmailBooking,
  SendDocumentsEmailCustomer,
  SendDocumentsSourceContext,
} from './send-documents-email.types';
import {
  BOOKING_PACKAGE_TYPES,
  PICKUP_SEND_TYPES,
  RETURN_SEND_TYPES,
  currentDocumentsByType,
  hasCustomerEmail,
  isDocumentSelectable,
  selectableIdsFromTypes,
} from './send-documents-email.utils';

export interface OpenSendDocumentsEmailParams {
  bookingId: string;
  customer?: SendDocumentsEmailCustomer | null;
  booking?: SendDocumentsEmailBooking | null;
  /** Skip bundle fetch when documents are already loaded (e.g. BookingDocumentsSection). */
  documents?: GeneratedDocumentDto[];
  documentTypes?: string[];
  initiallySelectedDocumentIds?: string[];
  sourceContext: SendDocumentsSourceContext;
  initialMessage?: string;
  onSent?: () => void | Promise<void>;
}

interface LauncherModalState extends OpenSendDocumentsEmailParams {
  open: boolean;
  documents: GeneratedDocumentDto[];
}

interface SendDocumentsEmailLauncherContextValue {
  openForBooking: (params: OpenSendDocumentsEmailParams) => Promise<void>;
  opening: boolean;
  canSend: boolean;
}

const SendDocumentsEmailLauncherCtx = createContext<SendDocumentsEmailLauncherContextValue>({
  openForBooking: async () => {},
  opening: false,
  canSend: false,
});

export function useSendDocumentsEmailLauncher() {
  return useContext(SendDocumentsEmailLauncherCtx);
}

function handoverToastLabel(kind: 'PICKUP' | 'RETURN'): string {
  return kind === 'PICKUP' ? 'Pickup-Protokoll senden' : 'Protokoll senden';
}

export function SendDocumentsEmailLauncherProvider({ children }: { children: ReactNode }) {
  const { orgId, userRole } = useRentalOrg();
  const canSend = canSendDocumentsEmail(userRole);
  const [opening, setOpening] = useState(false);
  const [modal, setModal] = useState<LauncherModalState | null>(null);

  const openForBooking = useCallback(
    async (params: OpenSendDocumentsEmailParams) => {
      if (!orgId) {
        toast.error('Organisation nicht geladen');
        return;
      }
      if (!canSend) {
        toast.error('Keine Berechtigung zum Dokumentenversand');
        return;
      }

      setOpening(true);
      try {
        let documents = params.documents;
        let customer = params.customer;
        let booking = params.booking;

        if (!documents) {
          const bundle = await api.documents.listForBooking(orgId, params.bookingId);
          documents = bundle.documents ?? [];
        }

        if (!customer?.email?.trim() || !hasCustomerEmail(customer)) {
          try {
            const detail = await api.bookings.detail(orgId, params.bookingId);
            customer = {
              email: detail.customer.email,
              fullName: detail.customer.fullName,
            };
            booking = {
              id: detail.core.bookingId,
              bookingNumber: detail.core.bookingNumber,
            };
          } catch {
            /* keep partial customer */
          }
        }

        if (!hasCustomerEmail(customer)) {
          toast.error('Kunde hat keine gültige E-Mail-Adresse');
          return;
        }

        const byType = currentDocumentsByType(documents);
        const preselected =
          params.initiallySelectedDocumentIds?.filter((id) => {
            const doc = documents!.find((d) => d.id === id);
            return isDocumentSelectable(doc);
          }) ?? [];

        const fallbackTypes = params.documentTypes ?? [...BOOKING_PACKAGE_TYPES];
        const selectedIds =
          preselected.length > 0
            ? preselected
            : selectableIdsFromTypes(fallbackTypes, byType);

        if (selectedIds.length === 0) {
          const anySelectable = documents.some((d) => isDocumentSelectable(d));
          if (!anySelectable) {
            toast.error('Keine sendbaren Dokumente vorhanden');
            return;
          }
          toast.error('Bitte zuerst Dokumente generieren');
          return;
        }

        setModal({
          ...params,
          open: true,
          customer,
          booking,
          documents,
          initiallySelectedDocumentIds: selectedIds,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Dokumente konnten nicht geladen werden');
      } finally {
        setOpening(false);
      }
    },
    [canSend, orgId],
  );

  useEffect(() => {
    const onHandoverCompleted = (event: Event) => {
      if (!canSend || !orgId) return;
      const detail = (event as CustomEvent<{
        bookingId?: string;
        kind?: 'PICKUP' | 'RETURN';
        customerId?: string | null;
        customerName?: string;
      }>).detail;
      if (!detail?.bookingId || !detail.kind) return;

      const types =
        detail.kind === 'PICKUP' ? [...PICKUP_SEND_TYPES] : [...RETURN_SEND_TYPES];
      const sourceContext: SendDocumentsSourceContext =
        detail.kind === 'PICKUP' ? 'HANDOVER_PICKUP' : 'HANDOVER_RETURN';

      toast.success(
        detail.kind === 'PICKUP' ? 'Abholung abgeschlossen' : 'Rückgabe abgeschlossen',
        {
          description: 'Protokoll per E-Mail an den Kunden senden?',
          action: {
            label: handoverToastLabel(detail.kind),
            onClick: () => {
              void openForBooking({
                bookingId: detail.bookingId!,
                customer: { fullName: detail.customerName },
                documentTypes: types,
                sourceContext,
              });
            },
          },
        },
      );
    };

    window.addEventListener('handover:completed', onHandoverCompleted);
    return () => window.removeEventListener('handover:completed', onHandoverCompleted);
  }, [canSend, openForBooking, orgId]);

  const value = useMemo(
    () => ({ openForBooking, opening, canSend }),
    [openForBooking, opening, canSend],
  );

  return (
    <SendDocumentsEmailLauncherCtx.Provider value={value}>
      {children}
      {modal && orgId ? (
        <SendDocumentsEmailModal
          open={modal.open}
          onOpenChange={(open) => {
            if (!open) setModal(null);
            else setModal((prev) => (prev ? { ...prev, open } : prev));
          }}
          orgId={orgId}
          bookingId={modal.bookingId}
          customer={modal.customer}
          booking={modal.booking}
          documents={modal.documents}
          documentTypes={modal.documentTypes}
          initiallySelectedDocumentIds={modal.initiallySelectedDocumentIds}
          sourceContext={modal.sourceContext}
          initialMessage={modal.initialMessage}
          onSent={async () => {
            await modal.onSent?.();
            setModal(null);
          }}
        />
      ) : null}
    </SendDocumentsEmailLauncherCtx.Provider>
  );
}
