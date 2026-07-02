import { DataCard, Timeline } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import type { CustomerDetail, CustomerListRow } from './customerDetailTypes';
import { formatDate, formatDateTime } from './customerDetailUtils';
import { CustomerQuickViewDetailRow } from './CustomerQuickViewDetailRow';
import { cdv } from './customer-detail-ui';

interface CustomerOverviewTabProps {
  customer: CustomerListRow;
  detail: CustomerDetail | null;
  totalBookings: number;
  lastBookingDate?: string | null;
  timelinePreview: Array<Record<string, unknown>>;
  onOpenTimeline: () => void;
}

export function CustomerOverviewTab({
  customer,
  detail,
  totalBookings,
  lastBookingDate,
  timelinePreview,
  onOpenTimeline,
}: CustomerOverviewTabProps) {
  const timelineItems = timelinePreview.slice(0, 5).map((ev, idx) => ({
    id: String(ev.id ?? `ev-${idx}`),
    title: String(ev.title ?? ev.type ?? 'Ereignis'),
    time: ev.createdAt ? formatDateTime(String(ev.createdAt)) : undefined,
    description: ev.description ? String(ev.description) : undefined,
  }));

  return (
    <div className="space-y-3">
      <div className={cdv.twoColGrid}>
        <DataCard title="Identität & Kontakt" bodyClassName="py-2">
          {[
            { label: 'Name', value: customer.name },
            { label: 'Geburtsdatum', value: formatDate(detail?.dateOfBirth) },
            { label: 'Telefon', value: customer.phone },
            { label: 'E-Mail', value: customer.email },
            {
              label: 'Adresse',
              value:
                [detail?.address, [detail?.zip, detail?.city].filter(Boolean).join(' ')]
                  .filter(Boolean)
                  .join(', ') || undefined,
            },
            { label: 'Kundentyp', value: customer.type === 'Corporate' ? 'Firma' : 'Privat' },
            ...(customer.company ? [{ label: 'Firma', value: customer.company }] : []),
            ...(detail?.taxId ? [{ label: 'USt-IdNr.', value: detail.taxId }] : []),
          ].map((row) => (
            <CustomerQuickViewDetailRow key={row.label} label={row.label} value={row.value} />
          ))}
          {detail?.notes ? (
            <div className="mt-2 border-t border-border/40 pt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Notizen
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[12px] text-muted-foreground">{detail.notes}</p>
            </div>
          ) : null}
        </DataCard>

        <DataCard title="Operative Kennzahlen" bodyClassName="py-2">
          <CustomerQuickViewDetailRow label="Buchungen gesamt" value={String(totalBookings)} />
          <CustomerQuickViewDetailRow label="Letzte Buchung" value={formatDate(lastBookingDate)} />
          <CustomerQuickViewDetailRow label="Kunde seit" value={formatDate(detail?.createdAt)} />
          {customer.currentVehicle ? (
            <CustomerQuickViewDetailRow label="Aktuelles Fahrzeug" value={customer.currentVehicle} />
          ) : null}
        </DataCard>
      </div>

      <DataCard
        title="Letzte Aktivitäten"
        actions={
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={onOpenTimeline}
          >
            Alle anzeigen
          </Button>
        }
        bodyClassName="py-3"
      >
        {timelineItems.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Noch keine Timeline-Einträge.</p>
        ) : (
          <Timeline items={timelineItems} />
        )}
      </DataCard>
    </div>
  );
}

export { bookingStatusTone } from './customerOverviewTabUtils';
