import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Mail,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import {
  api,
  type BookingDocumentBundleView,
  type DocumentBundleStatus,
  type GeneratedDocumentDto,
} from '../../lib/api';
import { SendDocumentsEmailModal } from '../../components/email/SendDocumentsEmailModal';
import { useRentalOrg } from '../RentalContext';

interface BookingDocumentsSectionProps {
  orgId: string;
  bookingId: string;
  isDarkMode: boolean;
  customerEmail?: string | null;
  bookingNumber?: string | null;
}

const GROUPS: { label: string; types: string[] }[] = [
  {
    label: 'Bei Buchung',
    types: ['BOOKING_INVOICE', 'DEPOSIT_RECEIPT', 'RENTAL_CONTRACT', 'TERMS_AND_CONDITIONS', 'WITHDRAWAL_INFORMATION'],
  },
  { label: 'Bei Abholung', types: ['HANDOVER_PICKUP'] },
  { label: 'Bei Rückgabe', types: ['HANDOVER_RETURN', 'FINAL_INVOICE'] },
];

const TYPE_LABEL: Record<string, string> = {
  BOOKING_INVOICE: 'Rechnung',
  DEPOSIT_RECEIPT: 'Kautionsbeleg',
  RENTAL_CONTRACT: 'Mietvertrag',
  TERMS_AND_CONDITIONS: 'AGB',
  WITHDRAWAL_INFORMATION: 'Widerrufsbelehrung',
  HANDOVER_PICKUP: 'Übergabeprotokoll (Abholung)',
  HANDOVER_RETURN: 'Übergabeprotokoll (Rückgabe)',
  FINAL_INVOICE: 'Schlussrechnung',
};

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

export function BookingDocumentsSection({
  orgId,
  bookingId,
  isDarkMode,
  customerEmail,
  bookingNumber,
}: BookingDocumentsSectionProps) {
  const { userRole } = useRentalOrg();
  const canManage = userRole === 'ORG_ADMIN' || userRole === 'MASTER_ADMIN';

  const [view, setView] = useState<BookingDocumentBundleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyType, setBusyType] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendDocIds, setSendDocIds] = useState<string[] | undefined>(undefined);

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

  // Current (most recent, non-void) document per type.
  const currentByType = useMemo(() => {
    const map: Record<string, GeneratedDocumentDto> = {};
    const docs = [...(view?.documents ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const d of docs) {
      if (d.status === 'VOID') continue;
      map[d.documentType] = d; // later (newer) overwrites earlier
    }
    return map;
  }, [view]);

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

  const sendableDocuments = useMemo(
    () => Object.values(currentByType).filter((d) => d.status !== 'VOID'),
    [currentByType],
  );

  const openSendModal = (documentIds?: string[]) => {
    setSendDocIds(documentIds);
    setSendOpen(true);
  };

  const cardClass = `rounded-lg p-8 border shadow-sm ${isDarkMode ? 'surface-premium border-border' : 'bg-white border-gray-200'}`;
  const subtle = isDarkMode ? 'text-muted-foreground' : 'text-muted-foreground';
  const bundleStatus = (view?.bundle.status ?? 'PENDING') as DocumentBundleStatus;
  const badge = BUNDLE_BADGE[bundleStatus] ?? BUNDLE_BADGE.PENDING;
  const legalMissing = (view?.legal.missing?.length ?? 0) > 0;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between mb-3">
        <div className={`text-xs font-semibold uppercase tracking-wider ${subtle}`}>Dokumente</div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.cls(isDarkMode)}`}>
            {badge.label}
          </span>
          {canManage && sendableDocuments.length > 0 && (
            <button
              type="button"
              onClick={() => openSendModal()}
              title="Dokumente per E-Mail senden"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${
                isDarkMode
                  ? 'border-border text-foreground hover:bg-muted/80'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Mail className="w-3.5 h-3.5" />
              Per E-Mail
            </button>
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
              <div className={`text-[11px] font-semibold uppercase tracking-wider mb-2.5 ${isDarkMode ? 'text-gray-600' : 'text-muted-foreground'}`}>
                {group.label}
              </div>
              <div className="space-y-2.5">
                {group.types.map((type) => {
                  const doc = currentByType[type];
                  const isLegalMissing = LEGAL.has(type) && !doc;
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
                            {TYPE_LABEL[type] ?? type}
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
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {doc ? (
                          <>
                            {doc.origin === 'STATIC_LEGAL' && (
                              <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] ${isDarkMode ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
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
                            {canManage && (
                              <button
                                type="button"
                                title="Per E-Mail senden"
                                onClick={() => openSendModal([doc.id])}
                                className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-muted/80 text-muted-foreground hover:text-status-info' : 'hover:bg-muted text-muted-foreground hover:text-brand'}`}
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            )}
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
      <SendDocumentsEmailModal
        open={sendOpen}
        onOpenChange={setSendOpen}
        orgId={orgId}
        bookingId={bookingId}
        bookingNumber={bookingNumber}
        defaultToEmail={customerEmail}
        documents={sendableDocuments}
        preselectedDocumentIds={sendDocIds}
        onSent={() => void load()}
      />
    </div>
  );
}
