import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import { api } from '../../lib/api';
import { resolveDocumentPreviewUrl } from '../../rental/components/customer-detail/customerDetailUtils';
import type { CustomerDocumentRecord } from '../../rental/components/CustomerDocumentUploadBox';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import {
  buildOperatorDocumentSlots,
  formatOperatorDocumentMeta,
  OPERATOR_BOOKING_DOCUMENT_GROUPS,
  OPERATOR_CUSTOMER_DOCUMENT_LABELS,
  OPERATOR_DOCUMENT_AVAILABILITY_LABELS,
  OPERATOR_DOCUMENT_TYPE_LABELS,
  type OperatorDocumentAvailability,
} from './operatorBookingDocuments.utils';
import { useOperatorBookingDocuments } from './useOperatorBookingDocuments';

function availabilityTone(status: OperatorDocumentAvailability): 'success' | 'neutral' | 'watch' | 'critical' {
  if (status === 'available') return 'success';
  if (status === 'generating') return 'watch';
  if (status === 'failed') return 'critical';
  return 'neutral';
}

interface Props {
  orgId: string | undefined;
  bookingId: string | undefined;
  customerId?: string;
  /** Optional AI Upload CTA below document list */
  onAiUpload?: () => void;
  compact?: boolean;
}

function useOperatorCustomerDocuments(orgId: string | undefined, customerId: string | undefined) {
  const [documents, setDocuments] = useState<CustomerDocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!orgId || !customerId) {
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await api.customers.customerDocuments.list(orgId, customerId);
      setDocuments(Array.isArray(rows) ? (rows as unknown as CustomerDocumentRecord[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kundendokumente konnten nicht geladen werden');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, customerId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { documents, loading, error, reload };
}

export function OperatorBookingDocumentsPanel({
  orgId,
  bookingId,
  customerId,
  onAiUpload,
  compact,
}: Props) {
  const { view, loading, error, reload } = useOperatorBookingDocuments(orgId, bookingId);
  const customerDocs = useOperatorCustomerDocuments(orgId, customerId);

  const handleReload = () => {
    void reload();
    if (customerId) void customerDocs.reload();
  };

  const slots = useMemo(() => buildOperatorDocumentSlots(view), [view]);
  const slotsByType = useMemo(() => {
    const m = new Map(slots.map((s) => [s.documentType, s]));
    return m;
  }, [slots]);

  const extraSlots = slots.filter(
    (s) => !OPERATOR_BOOKING_DOCUMENT_GROUPS.some((g) => g.types.includes(s.documentType)),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Buchungsdokumente</p>
        <button
          type="button"
          disabled={loading || customerDocs.loading || !bookingId}
          onClick={handleReload}
          className="sq-press inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold disabled:opacity-50"
        >
          {(loading || customerDocs.loading) ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Neu laden
        </button>
      </div>

      {view?.bundle?.status && (
        <p className="text-xs text-muted-foreground">
          Paket-Status: <span className="font-semibold text-foreground">{view.bundle.status}</span>
          {view.bundle.lastError && (
            <span className="block text-[color:var(--status-critical)]">{view.bundle.lastError}</span>
          )}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-3 py-2 text-xs text-[color:var(--status-critical)]">
          {error}
        </p>
      )}

      {loading && !view && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Dokumente laden…
        </div>
      )}

      {!loading && slots.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          Keine Buchungsdokumente im Bundle.
          {/* Server-side handover protocol document generation runs on handover complete — no frontend PDF. */}
        </p>
      )}

      {OPERATOR_BOOKING_DOCUMENT_GROUPS.map((group) => {
        const groupSlots = group.types
          .map((t) => slotsByType.get(t))
          .filter((s): s is NonNullable<typeof s> => Boolean(s));
        if (groupSlots.length === 0) return null;
        return (
          <div key={group.groupLabel} className="space-y-2">
            {!compact && (
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {group.groupLabel}
              </p>
            )}
            {groupSlots.map((slot) => (
              <DocumentCard
                key={slot.documentType}
                label={OPERATOR_DOCUMENT_TYPE_LABELS[slot.documentType] ?? slot.label}
                meta={slot.doc ? formatOperatorDocumentMeta(slot.doc) : undefined}
                availability={slot.availability}
                onOpen={slot.doc && orgId ? () => void api.documents.open(orgId, slot.doc!.id) : undefined}
              />
            ))}
          </div>
        );
      })}

      {extraSlots.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Weitere</p>
          {extraSlots.map((slot) => (
            <DocumentCard
              key={slot.documentType}
              label={slot.label}
              meta={slot.doc ? formatOperatorDocumentMeta(slot.doc) : undefined}
              availability={slot.availability}
              onOpen={slot.doc && orgId ? () => void api.documents.open(orgId, slot.doc!.id) : undefined}
            />
          ))}
        </div>
      )}

      {customerId && (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Kundendokumente
          </p>
          {customerDocs.error && (
            <p className="text-xs text-[color:var(--status-critical)]">{customerDocs.error}</p>
          )}
          {customerDocs.loading && customerDocs.documents.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Kundendokumente laden…
            </div>
          )}
          {!customerDocs.loading && customerDocs.documents.length === 0 && !customerDocs.error && (
            <p className="text-sm text-muted-foreground">Keine Kundendokumente hinterlegt.</p>
          )}
          {customerDocs.documents.map((doc) => {
            const url = resolveDocumentPreviewUrl(doc.fileKey);
            const label = OPERATOR_CUSTOMER_DOCUMENT_LABELS[doc.type] ?? doc.type;
            const availability: OperatorDocumentAvailability = url ? 'available' : 'missing';
            return (
              <DocumentCard
                key={doc.id}
                label={label}
                meta={doc.status}
                availability={availability}
                onOpen={
                  url
                    ? () => {
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      )}

      {onAiUpload && (
        <button
          type="button"
          onClick={onAiUpload}
          className="sq-press flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-dashed border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]/30 px-4 text-left"
        >
          <FileText className="h-5 w-5 shrink-0 text-[color:var(--brand-ink)]" />
          <span>
            <span className="block text-sm font-semibold">Dokument/Beleg per AI Upload hochladen</span>
            <span className="text-[11px] text-muted-foreground">
              Extraktion & Übernahme erst nach Bestätigung
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

function DocumentCard({
  label,
  meta,
  availability,
  onOpen,
}: {
  label: string;
  meta?: string;
  availability: OperatorDocumentAvailability;
  onOpen?: () => void;
}) {
  return (
    <OperatorGlassCard className="flex items-center gap-3 p-3">
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
        <StatusChip tone={availabilityTone(availability)} className="mt-1.5">
          {OPERATOR_DOCUMENT_AVAILABILITY_LABELS[availability]}
        </StatusChip>
      </div>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="sq-press flex min-h-[44px] min-w-[72px] flex-col items-center justify-center rounded-xl border border-border bg-card px-2 text-[10px] font-semibold"
        >
          <ExternalLink className="mb-0.5 h-4 w-4" />
          Öffnen
        </button>
      ) : null}
    </OperatorGlassCard>
  );
}
