import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { SupportTicket } from '../../lib/api';
import { cn } from '../ui/utils';

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

export function SupportTechnicalContextCard({ ticket, orgName, className }: SupportTechnicalContextCardProps) {
  const { t, formattingLocale } = useLanguage();
  const [open, setOpen] = useState(true);
  const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
  const aiTriage = (meta.aiTriage ?? {}) as Record<string, unknown>;

  const displayValue = (value: unknown): string => {
    if (value == null || value === '') return t('support.ops.technicalContext.notAvailable');
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return t('support.ops.technicalContext.notAvailable');
  };

  const formatDateTime = (iso: string | null | undefined): string => {
    if (!iso) return t('support.time.emDash');
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return t('support.time.emDash');
    return d.toLocaleString(formattingLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const entries: Array<{ labelKey: TranslationKey; value: string }> = [
      {
        labelKey: 'support.ops.technicalContext.sourcePage',
        value: displayValue(ticket.sourcePage ?? meta.path),
      },
      {
        labelKey: 'support.ops.filter.organization',
        value: orgName ?? displayValue(ticket.organizationId),
      },
      {
        labelKey: 'support.ops.technicalContext.vehicleId',
        value: displayValue(
          meta.vehicleId ?? (ticket.relatedEntityType === 'VEHICLE' ? ticket.relatedEntityId : null),
        ),
      },
      {
        labelKey: 'support.ops.technicalContext.licensePlate',
        value: displayValue(meta.licensePlate),
      },
      {
        labelKey: 'support.ops.technicalContext.vin',
        value: displayValue(meta.vin),
      },
      {
        labelKey: 'support.entityBooking',
        value: displayValue(
          meta.bookingId ?? (ticket.relatedEntityType === 'BOOKING' ? ticket.relatedEntityId : null),
        ),
      },
      {
        labelKey: 'support.entityInvoice',
        value: displayValue(
          meta.invoiceId ?? (ticket.relatedEntityType === 'INVOICE' ? ticket.relatedEntityId : null),
        ),
      },
      {
        labelKey: 'support.ops.technicalContext.moduleTab',
        value: displayValue(meta.selectedTab ?? meta.contextKind),
      },
      {
        labelKey: 'support.ops.technicalContext.dimoStatus',
        value: displayValue(meta.connectionStatus),
      },
      {
        labelKey: 'support.ops.technicalContext.provider',
        value: displayValue(meta.provider),
      },
      {
        labelKey: 'support.ops.technicalContext.lastSeen',
        value: meta.lastSeen ? formatDateTime(String(meta.lastSeen)) : displayValue(meta.lastTelemetryAt),
      },
      {
        labelKey: 'support.ops.technicalContext.healthSummary',
        value: displayValue(meta.healthStatusSummary ?? meta.overallState),
      },
      {
        labelKey: 'support.ops.technicalContext.userAgent',
        value: displayValue(meta.userAgent),
      },
      {
        labelKey: 'support.ops.technicalContext.viewport',
        value: displayValue(meta.viewport),
      },
      {
        labelKey: 'support.ops.technicalContext.helpCenter',
        value: meta.helpCenterAttempted ? t('common.yes') : t('common.no'),
      },
    ];

    if (aiTriage.summaryForAdmin) {
      entries.push({
        labelKey: 'support.ops.technicalContext.aiSummary',
        value: displayValue(aiTriage.summaryForAdmin),
      });
    }

  const rows = entries.map((entry) => ({
    label: t(entry.labelKey),
    value: entry.value,
  }));

  return (
    <div className={cn('border-t border-border/30', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold text-muted-foreground hover:bg-muted/30"
      >
        {t('support.ops.technicalContext.title')}
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
