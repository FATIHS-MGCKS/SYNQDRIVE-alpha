import { DataCard, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import type { CustomerEligibility } from './customerDetailTypes';
import {
  eligibilityStageForConfirm,
  eligibilityStageForCreate,
  eligibilityStageForPickup,
  EM_DASH,
  formatCurrencyCents,
  formatDate,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
} from './customerDetailUtils';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../../lib/entityMappers';
import {
  formatStressScore,
  stressToneToStatusTone,
} from '../../lib/scoreFormat';
import { CustomerQuickViewDetailRow } from './CustomerQuickViewDetailRow';
import {
  cdv,
  customerVerificationTone,
  ELIGIBILITY_LOAD_ERROR_USER,
} from './customer-detail-ui';

function stageLabel(stage: 'allowed' | 'warning' | 'blocked'): string {
  if (stage === 'allowed') return 'Erlaubt';
  if (stage === 'warning') return 'Warnung';
  return 'Blockiert';
}

function stageTone(stage: 'allowed' | 'warning' | 'blocked'): StatusTone {
  if (stage === 'allowed') return 'success';
  if (stage === 'warning') return 'warning';
  return 'critical';
}

interface CustomerDecisionCardsProps {
  eligibility: CustomerEligibility | null;
  eligibilityLoading?: boolean;
  eligibilityError?: string | null;
  onRetryEligibility?: () => void;
  idVerificationStatus?: string | null;
  licenseVerificationStatus?: string | null;
  idExpiry?: string | null;
  licenseExpiry?: string | null;
  onOpenDocuments?: () => void;
  openInvoices: number;
  overdueInvoices: number;
  openFines: number;
  totalRevenueCents: number;
  totalBookings: number;
  lastBookingDate?: string | null;
  drivingStressScore?: number | null;
  stressLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  hasEnoughData?: boolean;
  drivingEvents: number;
  abuseEvents: number;
}

export function CustomerDecisionCards({
  eligibility,
  eligibilityLoading,
  eligibilityError,
  onRetryEligibility,
  idVerificationStatus,
  licenseVerificationStatus,
  idExpiry,
  licenseExpiry,
  onOpenDocuments,
  openInvoices,
  overdueInvoices,
  openFines,
  totalRevenueCents,
  totalBookings,
  lastBookingDate,
  drivingStressScore,
  stressLevel,
  hasEnoughData,
  drivingEvents,
  abuseEvents,
}: CustomerDecisionCardsProps) {
  const idUi = customerVerificationApiToUi(idVerificationStatus ?? undefined);
  const licenseUi = customerVerificationApiToUi(licenseVerificationStatus ?? undefined);

  const createStage = eligibilityStageForCreate(eligibility);
  const confirmStage = eligibilityStageForConfirm(eligibility);
  const pickupStage = eligibilityStageForPickup(eligibility);

  const stressDisplay = formatStressScore(drivingStressScore, {
    hasEnoughData: hasEnoughData !== false,
    level: stressLevel ?? undefined,
  });

  return (
    <div className={cdv.sectionGrid}>
      <DataCard title="Mietfreigabe" bodyClassName="py-2">
        {eligibilityLoading ? (
          <p className="text-[12px] text-muted-foreground">Wird geladen…</p>
        ) : eligibilityError ? (
          <div
            className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5"
            title={eligibilityError}
          >
            <p className="text-[12px] font-medium text-foreground">{ELIGIBILITY_LOAD_ERROR_USER}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Bitte erneut laden oder später prüfen.
            </p>
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
          <div className="space-y-2.5">
            <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
              {overallRentalClearanceLabel(eligibility)}
            </StatusChip>
            <div className="space-y-0">
              {[
                { label: 'Buchung erstellen', stage: createStage },
                { label: 'Buchung bestätigen', stage: confirmStage },
                { label: 'Fahrzeugübergabe', stage: pickupStage },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 border-b border-border/40 py-2 last:border-b-0"
                >
                  <span className="text-[12px] text-muted-foreground">{row.label}</span>
                  <StatusChip tone={stageTone(row.stage)} className="text-[10px]">
                    {stageLabel(row.stage)}
                  </StatusChip>
                </div>
              ))}
            </div>
            {eligibility.blockingReasons.length > 0 ? (
              <div className="space-y-1 rounded-md bg-muted/25 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Blocker
                </p>
                {eligibility.blockingReasons.slice(0, 3).map((r) => (
                  <p key={r} className="text-[11px] leading-snug text-[color:var(--status-critical)]">
                    {r}
                  </p>
                ))}
              </div>
            ) : null}
            {eligibility.warnings.length > 0 ? (
              <div className="space-y-1 rounded-md bg-muted/25 px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Hinweise
                </p>
                {eligibility.warnings.slice(0, 2).map((w) => (
                  <p key={w} className="text-[11px] leading-snug text-[color:var(--status-attention)]">
                    {w}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">Keine Freigabedaten</p>
        )}
      </DataCard>

      <DataCard
        title="Verifikation"
        actions={
          onOpenDocuments ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={onOpenDocuments}
            >
              Dokumente prüfen
            </Button>
          ) : undefined
        }
        bodyClassName="py-2"
      >
        <CustomerQuickViewDetailRow
          label="Ausweis"
          value={
            <StatusChip tone={customerVerificationTone(idUi)} className="text-[10px]">
              {customerVerificationUiLabelDe(idUi)}
            </StatusChip>
          }
        />
        <CustomerQuickViewDetailRow label="Gültig bis" value={formatDate(idExpiry)} />
        <CustomerQuickViewDetailRow
          label="Führerschein"
          value={
            <StatusChip tone={customerVerificationTone(licenseUi)} className="text-[10px]">
              {customerVerificationUiLabelDe(licenseUi)}
            </StatusChip>
          }
        />
        <CustomerQuickViewDetailRow label="FS gültig bis" value={formatDate(licenseExpiry)} />
      </DataCard>

      <DataCard title="Finanzielle Belastung" bodyClassName="py-2">
        <CustomerQuickViewDetailRow label="Offene Rechnungen" value={String(openInvoices)} />
        <CustomerQuickViewDetailRow
          label="Überfällig"
          value={String(overdueInvoices)}
        />
        <CustomerQuickViewDetailRow label="Offene Bußgelder" value={String(openFines)} />
        <CustomerQuickViewDetailRow
          label="Gesamtumsatz"
          value={totalRevenueCents > 0 ? formatCurrencyCents(totalRevenueCents) : EM_DASH}
        />
      </DataCard>

      <DataCard title="Mietverhalten & Fahrbelastung" bodyClassName="py-2">
        <CustomerQuickViewDetailRow label="Buchungen" value={String(totalBookings)} />
        <CustomerQuickViewDetailRow label="Letzte Buchung" value={formatDate(lastBookingDate)} />
        <CustomerQuickViewDetailRow
          label="Fahrbelastung"
          value={
            stressDisplay.isMissing ? (
              EM_DASH
            ) : (
              <StatusChip tone={stressToneToStatusTone(stressDisplay.tone)} className="text-[10px]">
                {stressDisplay.label}
              </StatusChip>
            )
          }
        />
        {drivingEvents > 0 || abuseEvents > 0 ? (
          <p className="pt-1 text-[11px] text-muted-foreground">
            {drivingEvents} Fahrereignisse · {abuseEvents} Missbrauchsereignisse
          </p>
        ) : null}
      </DataCard>
    </div>
  );
}
