import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';

import {
  api,
  type BookingDocumentBundleView,
  type DocumentBundleStatus,
} from '../../lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '../../components/ui/tooltip';
import { Button } from '../../components/ui/button';
import { useRentalOrg } from '../RentalContext';
import { SendDocumentsEmailModal } from './send-documents-email/SendDocumentsEmailModal';
import type {
  SendDocumentsEmailBooking,
  SendDocumentsEmailCustomer,
  SendDocumentsSourceContext,
} from './send-documents-email/send-documents-email.types';
import {
  BOOKING_PACKAGE_TYPES,
  DOCUMENT_TYPE_LABEL,
  PICKUP_SEND_TYPES,
  RETURN_SEND_TYPES,
  currentDocumentsByType,
  formatSentHint,
  hasCustomerEmail,
  selectableIdsFromTypes,
} from './send-documents-email/send-documents-email.utils';

interface BookingDocumentsSectionProps {
  orgId: string;
  bookingId: string;
  isDarkMode: boolean;
  customer?: SendDocumentsEmailCustomer | null;
  booking?: SendDocumentsEmailBooking | null;
}

const GROUPS: { label: string; types: string[]; sendLabel?: string; sourceContext?: SendDocumentsSourceContext }[] = [
  {
    label: 'Bei Buchung',
    types: [...BOOKING_PACKAGE_TYPES],
    sendLabel: 'Dokumentenpaket senden',
    sourceContext: 'BOOKING_DOCUMENTS',
  },
  {
    label: 'Bei Abholung',
    types: [...PICKUP_SEND_TYPES],
    sendLabel: 'Pickup-Protokoll senden',
    sourceContext: 'HANDOVER_PICKUP',
  },
  {
    label: 'Bei Rückgabe',
    types: [...RETURN_SEND_TYPES],
    sendLabel: 'Return-Unterlagen senden',
    sourceContext: 'HANDOVER_RETURN',
  },
];

const REGENERABLE = new Set([
  'BOOKING_INVOICE',
  'DEPOSIT_RECEIPT',
  'RENTAL_CONTRACT',
  'TERMS_AND_CONDITIONS',
  'WITHDRAWAL_INFORMATION',
  'FINAL_INVOICE',
]);
const LEGAL = new Set(['TERMS_AND_CONDITIONS', 'WITHDRAWAL_INFORMATION']);

const BUNDLE_BADGE: Record<DocumentBundleStatus, { label: string; cls: (d: boolean) => string }> = {
  COMPLETE: { label: 'Vollständig', cls: (d) => (d ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200') },
  PARTIAL: { label: 'Unvollständig', cls: (d) => (d ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200') },
  PENDING: { label: 'Ausstehend', cls: (d) => (d ? 'bg-neutral-700/40 text-neutral-300 border-neutral-600' : 'bg-gray-100 text-gray-500 border-gray-200') },
  FAILED: { label: 'Fehlgeschlagen', cls: (d) => (d ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200') },
};

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type SendModalState = {
  open: boolean;
  documentTypes: string[];
  initiallySelectedDocumentIds: string[];
  sourceContext: SendDocumentsSourceContext;
};

export function BookingDocumentsSection({
  orgId,
  bookingId,
  isDarkMode,
  customer,
  booking,
}: BookingDocumentsSectionProps) {
  const { userRole } = useRentalOrg();
  const canSend =
    userRole === 'ORG_ADMIN' ||
    userRole === 'MASTER_ADMIN' ||
    userRole === 'SUB_ADMIN' ||
    userRole === 'WORKER';
  const canManage = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';

  const [view, setView] = useState<BookingDocumentBundleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendModal, setSendModal] = useState<SendModalState | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setLoading(true);
    try {
      const data = await api.documents.listForBooking(orgId, bookingId);
      setView(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'Dokumente konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [orgId, bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentByType = useMemo(
    () => currentDocumentsByType(view?.documents ?? []),
    [view?.documents],
  );

  const customerHasEmail = hasCustomerEmail(customer);

  const openSendModal = useCallback(
    (params: Omit<SendModalState, 'open'>) => {
      setSendModal({ ...params, open: true });
    },
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (!orgId || !bookingId) return;
    setGenerating(true);
    setError(null);
    try {
      const data = await api.documents.generateInitialBundle(orgId, bookingId);
      setView(data);
    } catch (err) {
      setError((err as Error).message || 'Generierung fehlgeschlagen');
    } finally {
      setGenerating(false);
    }
  }, [orgId, bookingId]);

  const handleRegenerate = useCallback(
    async (documentType: string) => {
      if (!orgId || !bookingId) return;
      setBusyType(documentType);
      setError(null);
      try {
        const data = await api.documents.regenerate(orgId, bookingId, documentType);
        setView(data);
      } catch (err) {
        setError((err as Error).message || 'Neugenerierung fehlgeschlagen');
      } finally {
        setBusyType(null);
      }
    },
    [orgId, bookingId],
  );

  const cardClass = `rounded-lg p-8 border shadow-sm ${isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'}`;
  const subtle = isDarkMode ? 'text-muted-foreground' : 'text-muted-foreground';
  const bundleStatus = (view?.bundle.status ?? 'PENDING') as DocumentBundleStatus;
  const badge = BUNDLE_BADGE[bundleStatus] ?? BUNDLE_BADGE.PENDING;
  const legalMissing = (view?.legal.missing?.length ?? 0) > 0;

  const renderSendButton = (
    label: string,
    types: readonly string[],
    sourceContext: SendDocumentsSourceContext,
    variant: 'header' | 'group' = 'group',
  ) => {
    const ids = selectableIdsFromTypes(types, currentByType);
    const disabled = !customerHasEmail || ids.length === 0;
    const tooltip = !customerHasEmail
      ? 'Kunde hat keine E-Mail-Adresse'
      : ids.length === 0
        ? 'Keine Dokumente vorhanden — bitte zuerst generieren'
        : undefined;

    const button = (
      <Button
        type="button"
        size="sm"
        variant={variant === 'header' ? 'default' : 'outline'}
        className={variant === 'header' ? 'text-xs h-8' : 'text-[11px] h-7'}
        disabled={!canSend || disabled}
        onClick={() =>
          openSendModal({
            documentTypes: [...types],
            initiallySelectedDocumentIds: ids,
            sourceContext,
          })
        }
      >
        <Send className="w-3.5 h-3.5 mr-1.5" />
        {label}
      </Button>
    );

    if (!tooltip) return button;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className={cardClass}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className={`text-xs font-semibold uppercase tracking-wider ${subtle}`}>Dokumente</div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls(isDarkMode)}`}>
            {badge.label}
          </span>
          {canSend &&
            renderSendButton(
              'Dokumentenpaket senden',
              BOOKING_PACKAGE_TYPES,
              'BOOKING_DOCUMENTS',
              'header',
            )}
          {canManage && (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={generating}
              title="Buchungsdokumente generieren"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                isDarkMode ? 'bg-white text-neutral-900 hover:bg-gray-100' : 'bg-neutral-900 text-white hover:surface-premium'
              } disabled:opacity-50`}
            >
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Generieren
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs mb-3 ${
          isDarkMode ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {legalMissing && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs mb-3 ${
          isDarkMode ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Dokumentenpaket unvollständig:{' '}
            {(view?.missingLegalDocuments ?? [])
              .map((d) => (d === 'TERMS_AND_CONDITIONS' ? 'AGB' : d === 'REVOCATION_POLICY' ? 'Widerrufsbelehrung' : d))
              .join(' / ') || 'AGB/Widerrufsbelehrung'}{' '}
            fehlt. Bitte in Administration → Unternehmen hochladen.
          </span>
        </div>
      )}

      {loading ? (
        <div className={`flex items-center gap-2 text-xs ${subtle}`}>
          <Loader2 className="w-4 h-4 animate-spin" /> Lädt…
        </div>
      ) : (
        <div className="space-y-4">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${isDarkMode ? 'text-gray-600' : 'text-muted-foreground'}`}>
                  {group.label}
                </div>
                {group.sendLabel && group.sourceContext && group.label !== 'Bei Buchung'
                  ? renderSendButton(group.sendLabel, group.types, group.sourceContext)
                  : null}
              </div>
              <div className="space-y-2.5">
                {group.types.map((type) => {
                  const doc = currentByType[type];
                  const isLegalMissing = LEGAL.has(type) && !doc;
                  const sentHint = doc ? formatSentHint(doc) : null;
                  return (
                    <div
                      key={type}
                      className={`flex items-center justify-between px-3 py-3 rounded-lg border ${
                        isDarkMode ? 'bg-muted/50 border-border/40' : 'bg-white border-gray-200/60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-muted/50' : 'bg-gray-100'}`}>
                          <FileText className={`w-4 h-4 ${isDarkMode ? 'text-foreground/85' : 'text-gray-600'}`} />
                        </div>
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {DOCUMENT_TYPE_LABEL[type] ?? type}
                          </div>
                          <div className={`text-[11px] truncate ${subtle}`}>
                            {doc
                              ? [doc.documentNumber || doc.fileName, doc.legalVersionLabel ? `v${doc.legalVersionLabel}` : null, fmtDate(doc.generatedAt || doc.createdAt)]
                                  .filter(Boolean)
                                  .join(' · ')
                              : isLegalMissing
                              ? 'Fehlt in Administration'
                              : 'Noch nicht erstellt'}
                          </div>
                          {sentHint ? (
                            <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${subtle}`}>
                              <Mail className="w-3 h-3 shrink-0" />
                              <span className="truncate">{sentHint}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc ? (
                          <>
                            {doc.origin === 'STATIC_LEGAL' && (
                              <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] ${subtle}`}>
                                <CheckCircle2 className="w-3 h-3" /> hochgeladen
                              </span>
                            )}
                            <button
                              type="button"
                              title="Herunterladen / Ansehen"
                              onClick={() => void api.documents.open(orgId, doc.id)}
                              className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-muted/80 text-muted-foreground hover:text-status-info' : 'hover:bg-muted text-muted-foreground hover:text-brand'}`}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {canManage && REGENERABLE.has(type) && (
                              <button
                                type="button"
                                title="Neu generieren"
                                disabled={busyType === type}
                                onClick={() => void handleRegenerate(type)}
                                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-muted/80 text-muted-foreground hover:text-status-attention' : 'hover:bg-gray-100 text-gray-500 hover:text-amber-600'} disabled:opacity-50`}
                              >
                                {busyType === type ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                              </button>
                            )}
                            {canSend && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    title="Weitere Aktionen"
                                    className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-muted/80 text-muted-foreground' : 'hover:bg-gray-100 text-gray-500'}`}
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    disabled={!customerHasEmail || doc.status === 'VOID'}
                                    onClick={() =>
                                      openSendModal({
                                        documentTypes: [type],
                                        initiallySelectedDocumentIds: [doc.id],
                                        sourceContext:
                                          type === 'HANDOVER_PICKUP'
                                            ? 'HANDOVER_PICKUP'
                                            : type === 'HANDOVER_RETURN'
                                              ? 'HANDOVER_RETURN'
                                              : type.includes('INVOICE')
                                                ? 'INVOICE'
                                                : 'BOOKING_DOCUMENTS',
                                      })
                                    }
                                  >
                                    <Mail className="w-4 h-4 mr-2" />
                                    Per E-Mail senden
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </>
                        ) : (
                          <span
                            className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                              isLegalMissing
                                ? isDarkMode
                                  ? 'bg-amber-500/15 text-amber-400'
                                  : 'bg-amber-50 text-amber-700'
                                : isDarkMode
                                ? 'surface-premium text-gray-500'
                                : 'bg-gray-100 text-gray-400'
                            }`}
                          >
                            {isLegalMissing ? 'Fehlt' : 'Ausstehend'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {sendModal?.open ? (
        <SendDocumentsEmailModal
          open={sendModal.open}
          onOpenChange={(open) => {
            if (!open) setSendModal(null);
          }}
          orgId={orgId}
          bookingId={bookingId}
          customer={customer}
          booking={booking}
          documents={view?.documents ?? []}
          documentTypes={sendModal.documentTypes}
          initiallySelectedDocumentIds={sendModal.initiallySelectedDocumentIds}
          sourceContext={sendModal.sourceContext}
          onSent={load}
        />
      ) : null}
    </div>
  );
}
