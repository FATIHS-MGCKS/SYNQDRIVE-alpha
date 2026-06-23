import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../ui/utils';
import type { SupportTicket } from '../../lib/api';
import { formatDateTime } from '../../master/components/support-ops/support-ops.utils';

interface SupportTechnicalContextCardProps {
  ticket: SupportTicket;
  orgName?: string;
  className?: string;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right text-foreground">{value}</span>
    </div>
  );
}

function display(value: unknown): string {
  if (value == null || value === '') return 'Nicht verfügbar';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return 'Nicht verfügbar';
}

export function SupportTechnicalContextCard({ ticket, orgName, className }: SupportTechnicalContextCardProps) {
  const [open, setOpen] = useState(true);
  const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
  const aiTriage = (meta.aiTriage ?? {}) as Record<string, unknown>;

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Quellseite', value: display(ticket.sourcePage ?? meta.path) },
    { label: 'Organisation', value: orgName ?? display(ticket.organizationId) },
    { label: 'Fahrzeug-ID', value: display(meta.vehicleId ?? (ticket.relatedEntityType === 'VEHICLE' ? ticket.relatedEntityId : null)) },
    { label: 'Kennzeichen', value: display(meta.licensePlate) },
    { label: 'VIN', value: display(meta.vin) },
    { label: 'Buchung', value: display(meta.bookingId ?? (ticket.relatedEntityType === 'BOOKING' ? ticket.relatedEntityId : null)) },
    { label: 'Rechnung', value: display(meta.invoiceId ?? (ticket.relatedEntityType === 'INVOICE' ? ticket.relatedEntityId : null)) },
    { label: 'Modul / Tab', value: display(meta.selectedTab ?? meta.contextKind) },
    { label: 'DIMO Status', value: display(meta.connectionStatus) },
    { label: 'Provider', value: display(meta.provider) },
    { label: 'Zuletzt gesehen', value: meta.lastSeen ? formatDateTime(String(meta.lastSeen)) : display(meta.lastTelemetryAt) },
    { label: 'Health Summary', value: display(meta.healthStatusSummary ?? meta.overallState) },
    { label: 'User Agent', value: display(meta.userAgent) },
    { label: 'Viewport', value: display(meta.viewport) },
    { label: 'Help Center', value: meta.helpCenterAttempted ? 'Ja' : 'Nein' },
  ];

  if (aiTriage.summaryForAdmin) {
    rows.push({ label: 'AI Summary', value: display(aiTriage.summaryForAdmin) });
  }

  return (
    <div className={cn('border-t border-border/30', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted/30"
      >
        Technischer Kontext
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-0.5 px-3 pb-3 text-[10px]">
          {rows.map((row) => (
            <MetaRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>
      )}
    </div>
  );
}
