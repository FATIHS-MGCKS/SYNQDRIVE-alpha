import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
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
} from './customerDetailUtils';

const cardBg = 'rounded-lg border border-border bg-card';

interface CustomerOverviewTabProps {
  customer: CustomerListRow;
  detail: CustomerDetail | null;
  eligibility: CustomerEligibility | null;
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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={`${cardBg} p-4 space-y-3`}>
          <h4 className="text-xs font-bold text-foreground">Identität & Kontakt</h4>
          {[
            { label: 'Name', value: customer.name },
            { label: 'Geburtsdatum', value: formatDate(detail?.dateOfBirth) },
            { label: 'Telefon', value: customer.phone || EM_DASH },
            { label: 'E-Mail', value: customer.email || EM_DASH },
            {
              label: 'Adresse',
              value:
                [detail?.address, [detail?.zip, detail?.city].filter(Boolean).join(' ')]
                  .filter(Boolean)
                  .join(', ') || EM_DASH,
            },
            { label: 'Kundentyp', value: customer.type === 'Corporate' ? 'Firma' : 'Privat' },
            ...(customer.company ? [{ label: 'Firma', value: customer.company }] : []),
            ...(detail?.taxId ? [{ label: 'USt-IdNr.', value: detail.taxId }] : []),
          ].map((row) => (
            <div key={row.label} className="flex justify-between gap-3 text-xs">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="font-medium text-foreground text-right">{row.value}</span>
            </div>
          ))}
          {detail?.notes && (
            <div className="pt-2 border-t border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notizen</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{detail.notes}</p>
            </div>
          )}
        </div>

        <div className={`${cardBg} p-4 space-y-3`}>
          <h4 className="text-xs font-bold text-foreground">Mietfreigabe (Kurz)</h4>
          {eligibility ? (
            <>
              <div className="space-y-1.5">
                {[
                  { label: 'Buchung erstellen', stage: eligibilityStageForCreate(eligibility) },
                  { label: 'Bestätigung', stage: eligibilityStageForConfirm(eligibility) },
                  { label: 'Übergabe', stage: eligibilityStageForPickup(eligibility) },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="font-semibold">{stageDe(r.stage)}</span>
                  </div>
                ))}
              </div>
              {(eligibility.blockingReasons.length > 0 || eligibility.warnings.length > 0) && (
                <div className="space-y-1 pt-2 border-t border-border">
                  {eligibility.blockingReasons.slice(0, 3).map((b) => (
                    <p key={b} className="text-[10px] text-[color:var(--status-critical)]">• {b}</p>
                  ))}
                  {eligibility.warnings.slice(0, 2).map((w) => (
                    <p key={w} className="text-[10px] text-[color:var(--status-attention)]">⚠ {w}</p>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onOpenDocuments}
                className="text-[10px] font-semibold text-[color:var(--brand)]"
              >
                Dokumente & Verifikation →
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Freigabedaten nicht verfügbar</p>
          )}
        </div>
      </div>

      <div className={`${cardBg} p-4`}>
        <h4 className="text-xs font-bold text-foreground mb-3">Business-Zusammenfassung</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="font-semibold">{customerStatusUiLabelDe(customer.status)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Risiko</p>
            <p className="font-semibold">{customerRiskUiLabelDe(customer.riskLevel)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Verifikation</p>
            <p className="font-semibold">
              Ausweis: {customerVerificationUiLabelDe(idUi)} · FS: {customerVerificationUiLabelDe(licenseUi)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Buchungen</p>
            <p className="font-semibold">{totalBookings}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Umsatz</p>
            <p className="font-semibold">
              {totalRevenueCents > 0 ? formatCurrencyCents(totalRevenueCents) : EM_DASH}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Offene Rechnungen / Bußgelder</p>
            <p className="font-semibold">
              {openInvoices} / {openFines}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Letzte Buchung</p>
            <p className="font-semibold">{formatDate(lastBookingDate)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Kunde seit</p>
            <p className="font-semibold">{formatDate(detail?.createdAt)}</p>
          </div>
        </div>
      </div>

      <div className={`${cardBg} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-bold text-foreground">Letzte Aktivitäten</h4>
          <button type="button" onClick={onOpenTimeline} className="text-[10px] font-semibold text-[color:var(--brand)]">
            Alle anzeigen →
          </button>
        </div>
        {timelinePreview.length === 0 ? (
          <p className="text-xs text-muted-foreground">Noch keine Timeline-Einträge.</p>
        ) : (
          <div className="divide-y divide-border">
            {timelinePreview.slice(0, 5).map((ev) => (
              <div key={String(ev.id)} className="py-2 flex justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {String(ev.title ?? ev.type ?? 'Ereignis')}
                  </p>
                  {ev.description ? (
                    <p className="text-[10px] text-muted-foreground line-clamp-2">
                      {String(ev.description)}
                    </p>
                  ) : null}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {ev.createdAt ? formatDateTime(String(ev.createdAt)) : EM_DASH}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
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
