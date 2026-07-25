import { useMemo } from 'react';
import { ExternalLink, FileText, Loader2, RefreshCw } from 'lucide-react';
import { StatusChip } from '../../components/patterns';
import { operatorApi } from '../lib/operatorApi';
import { OperatorGlassCard } from '../components/OperatorGlassCard';
import {
  OPERATOR_BOOKING_DOCUMENT_GROUPS,
  OPERATOR_CUSTOMER_DOCUMENT_LABELS,
  OPERATOR_DOCUMENT_AVAILABILITY_LABELS,
  OPERATOR_DOCUMENT_TYPE_LABELS,
  type OperatorDocumentAvailability,
} from './operatorBookingDocuments.utils';
import { useOperatorBookingContext } from './useOperatorBookingContext';

function availabilityTone(status: string): 'success' | 'neutral' | 'watch' | 'critical' {
  if (status === 'generated' || status === 'signed' || status === 'available') return 'success';
  if (status === 'missing' || status === 'required') return 'neutral';
  if (status === 'pending' || status === 'generating') return 'watch';
  return 'critical';
}

function mapSlotAvailability(slot: { available: boolean; status: string }): OperatorDocumentAvailability {
  if (slot.available) return 'available';
  if (slot.status === 'pending') return 'generating';
  if (slot.status === 'failed' || slot.status === 'error') return 'failed';
  return 'missing';
}

interface Props {
  orgId: string | undefined;
  bookingId: string | undefined;
  customerId?: string;
  process?: 'PICKUP' | 'RETURN' | 'DOCUMENT_CHECK' | 'DAMAGE';
  onAiUpload?: () => void;
  compact?: boolean;
}

function DocumentCard({
  label,
  meta,
  availability,
  onOpen,
  restricted,
}: {
  label: string;
  meta?: string;
  availability: OperatorDocumentAvailability;
  onOpen?: () => void;
  restricted?: boolean;
}) {
  return (
    <OperatorGlassCard className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm font-semibold truncate">{label}</p>
          </div>
          {meta && <p className="mt-1 text-[11px] text-muted-foreground">{meta}</p>}
          {restricted && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Vollansicht nur mit Dokumenten-Prüfrecht.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusChip tone={availabilityTone(availability)} size="sm">
            {OPERATOR_DOCUMENT_AVAILABILITY_LABELS[availability]}
          </StatusChip>
          {onOpen && (
            <button
              type="button"
              onClick={onOpen}
              className="sq-press inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Öffnen
            </button>
          )}
        </div>
      </div>
    </OperatorGlassCard>
  );
}

export function OperatorBookingDocumentsPanel({
  orgId,
  bookingId,
  customerId,
  process = 'DOCUMENT_CHECK',
  onAiUpload,
  compact,
}: Props) {
  const { context, loading, error, reload } = useOperatorBookingContext(orgId, bookingId, process);

  const slotsByType = useMemo(() => {
    const m = new Map(context?.bookingDocumentSlots.map((s) => [s.documentType, s]) ?? []);
    return m;
  }, [context]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase text-muted-foreground">Buchungsdokumente</p>
        <button
          type="button"
          disabled={loading || !bookingId}
          onClick={() => void reload()}
          className="sq-press inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Neu laden
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/[0.06] px-3 py-2 text-xs text-[color:var(--status-critical)]">
          {error}
        </p>
      )}

      {loading && !context && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Dokumentstatus laden…
        </div>
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
            {groupSlots.map((slot) => {
              const availability = mapSlotAvailability(slot);
              const canOpen = Boolean(slot.documentId && slot.available);
              return (
                <DocumentCard
                  key={slot.documentType}
                  label={OPERATOR_DOCUMENT_TYPE_LABELS[slot.documentType] ?? slot.documentType}
                  meta={slot.status}
                  availability={availability}
                  restricted={!canOpen && slot.available}
                  onOpen={
                    canOpen && orgId && bookingId
                      ? () =>
                          void operatorApi.grantBookingDocumentPreview(
                            orgId,
                            bookingId,
                            slot.documentId!,
                            process,
                          )
                      : undefined
                  }
                />
              );
            })}
          </div>
        );
      })}

      {customerId && context && (
        <div className="space-y-2 border-t border-border/50 pt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            Kundendokumente (Status)
          </p>
          {context.customerDocumentSlots.length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Kundendokumente hinterlegt.</p>
          )}
          {context.customerDocumentSlots.map((doc) => {
            const label = OPERATOR_CUSTOMER_DOCUMENT_LABELS[doc.type] ?? doc.type;
            const availability: OperatorDocumentAvailability =
              doc.status === 'VERIFIED' || doc.status === 'UPLOADED' || doc.status === 'PENDING_REVIEW'
                ? 'available'
                : 'missing';
            return (
              <DocumentCard
                key={doc.id}
                label={label}
                meta={doc.status}
                availability={availability}
                restricted={!doc.canViewFull}
                onOpen={
                  doc.canViewFull && orgId
                    ? () =>
                        void operatorApi.grantCustomerDocumentPreview(
                          orgId,
                          customerId,
                          doc.id,
                          process,
                        )
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
          className="sq-press w-full min-h-[44px] rounded-xl border border-dashed border-border text-sm font-semibold"
        >
          AI Upload
        </button>
      )}
    </div>
  );
}
