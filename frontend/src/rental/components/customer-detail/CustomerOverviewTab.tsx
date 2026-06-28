import { DataCard, StatusChip, Timeline } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import type { CustomerDetail, CustomerEligibility, CustomerListRow } from './customerDetailTypes';
import {
  customerStatusUiLabelDe,
  customerRiskUiLabelDe,
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../../lib/entityMappers';
import {
  EM_DASH,
  eligibilityStageForConfirm,
  eligibilityStageForCreate,
  eligibilityStageForPickup,
  formatDate,
  formatCurrencyCents,
  formatDateTime,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
} from './customerDetailUtils';
import { CustomerQuickViewDetailRow } from './CustomerQuickViewDetailRow';
import { cdv, ELIGIBILITY_LOAD_ERROR_USER } from './customer-detail-ui';

interface CustomerOverviewTabProps {
  customer: CustomerListRow;
  detail: CustomerDetail | null;
  eligibility: CustomerEligibility | null;
  eligibilityError?: string | null;
  onRetryEligibility?: () => void;
  totalRevenueCents: number;
  totalBookings: number;
  openInvoices: number;
  openFines: number;
  lastBookingDate?: string | null;
  timelinePreview: Array<Record<string, unknown>>;
  onOpenDocuments: () => void;
  onOpenTimeline: () => void;
}

function stageDe(stage: 'allowed' | 'warning' | 'blocked'): string {
  if (stage === 'allowed') return 'Erlaubt';
  if (stage === 'warning') return 'Warnung';
  return 'Blockiert';
}

export function CustomerOverviewTab({
  customer,
  detail,
  eligibility,
  eligibilityError,
  onRetryEligibility,
  totalRevenueCents,
  totalBookings,
  openInvoices,
  openFines,
  lastBookingDate,
  timelinePreview,
  onOpenDocuments,
  onOpenTimeline,
}: CustomerOverviewTabProps) {
  const idUi = customerVerificationApiToUi(detail?.idVerificationStatus ?? undefined);
  const licenseUi = customerVerificationApiToUi(detail?.licenseVerificationStatus ?? undefined);

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

        <DataCard
          title="Mietfreigabe"
          actions={
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={onOpenDocuments}
            >
              Dokumente
            </Button>
          }
          bodyClassName="py-2"
        >
          {eligibilityError ? (
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2" title={eligibilityError}>
              <p className="text-[12px] font-medium">{ELIGIBILITY_LOAD_ERROR_USER}</p>
              {onRetryEligibility ? (
                <Button
                  type="button"
                  size="sm"
                  variant="neutral"
                  className="mt-2 h-7"
                  onClick={onRetryEligibility}
                >
                  Erneut laden
                </Button>
              ) : null}
            </div>
          ) : eligibility ? (
            <>
              <StatusChip tone={overallRentalClearanceTone(eligibility)} dot className="mb-2">
                {overallRentalClearanceLabel(eligibility)}
              </StatusChip>
              {[
                { label: 'Buchung erstellen', stage: eligibilityStageForCreate(eligibility) },
                { label: 'Bestätigung', stage: eligibilityStageForConfirm(eligibility) },
                { label: 'Übergabe', stage: eligibilityStageForPickup(eligibility) },
              ].map((r) => (
                <CustomerQuickViewDetailRow key={r.label} label={r.label} value={stageDe(r.stage)} />
              ))}
            </>
          ) : (
            <p className="text-[12px] text-muted-foreground">Freigabedaten nicht verfügbar</p>
          )}
        </DataCard>
      </div>

      <DataCard title="Business-Zusammenfassung" bodyClassName="py-2">
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2">
          <CustomerQuickViewDetailRow
            label="Status"
            value={customerStatusUiLabelDe(customer.status)}
          />
          <CustomerQuickViewDetailRow label="Risiko" value={customerRiskUiLabelDe(customer.riskLevel)} />
          <CustomerQuickViewDetailRow
            label="Verifikation"
            value={`Ausweis: ${customerVerificationUiLabelDe(idUi)} · FS: ${customerVerificationUiLabelDe(licenseUi)}`}
          />
          <CustomerQuickViewDetailRow label="Buchungen" value={String(totalBookings)} />
          <CustomerQuickViewDetailRow
            label="Umsatz"
            value={totalRevenueCents > 0 ? formatCurrencyCents(totalRevenueCents) : EM_DASH}
          />
          <CustomerQuickViewDetailRow
            label="Offene Rechnungen / Bußgelder"
            value={`${openInvoices} / ${openFines}`}
          />
          <CustomerQuickViewDetailRow label="Letzte Buchung" value={formatDate(lastBookingDate)} />
          <CustomerQuickViewDetailRow label="Kunde seit" value={formatDate(detail?.createdAt)} />
        </div>
      </DataCard>

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

export function bookingStatusTone(status: string): StatusTone {
  const s = status.toLowerCase();
  if (s.includes('abgeschlossen') || s === 'completed') return 'info';
  if (s.includes('aktiv') || s === 'active') return 'success';
  if (s.includes('bestätigt') || s === 'confirmed') return 'info';
  if (s.includes('ausstehend') || s === 'pending') return 'warning';
  if (s.includes('storniert') || s.includes('no-show')) return 'neutral';
  return 'neutral';
}
