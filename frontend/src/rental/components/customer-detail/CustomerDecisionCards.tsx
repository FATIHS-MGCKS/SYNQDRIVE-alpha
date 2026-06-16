import { DataCard, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <DataCard title="Mietfreigabe" className="p-4">
        {eligibilityLoading ? (
          <p className="text-xs text-muted-foreground">Wird geladen…</p>
        ) : eligibilityError ? (
          <p className="text-xs text-[color:var(--status-critical)]">{eligibilityError}</p>
        ) : eligibility ? (
          <div className="space-y-3">
            <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
              {overallRentalClearanceLabel(eligibility)}
            </StatusChip>
            <div className="space-y-1.5">
              {[
                { label: 'Buchung erstellen', stage: createStage },
                { label: 'Buchung bestätigen', stage: confirmStage },
                { label: 'Fahrzeugübergabe', stage: pickupStage },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{row.label}</span>
                  <StatusChip tone={stageTone(row.stage)} className="text-[10px]">
                    {stageLabel(row.stage)}
                  </StatusChip>
                </div>
              ))}
            </div>
            {eligibility.blockingReasons.length > 0 && (
              <div className="space-y-0.5">
                {eligibility.blockingReasons.slice(0, 3).map((r) => (
                  <p key={r} className="text-[10px] text-[color:var(--status-critical)]">• {r}</p>
                ))}
              </div>
            )}
            {eligibility.warnings.length > 0 && (
              <div className="space-y-0.5">
                {eligibility.warnings.slice(0, 2).map((w) => (
                  <p key={w} className="text-[10px] text-[color:var(--status-attention)]">⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Keine Freigabedaten</p>
        )}
      </DataCard>

      <DataCard title="Verifikation" className="p-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Ausweis</span>
            <StatusChip tone={verificationTone(idUi)}>{customerVerificationUiLabelDe(idUi)}</StatusChip>
          </div>
          <p className="text-[10px] text-muted-foreground">Gültig bis {formatDate(idExpiry)}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">Führerschein</span>
            <StatusChip tone={verificationTone(licenseUi)}>
              {customerVerificationUiLabelDe(licenseUi)}
            </StatusChip>
          </div>
          <p className="text-[10px] text-muted-foreground">Gültig bis {formatDate(licenseExpiry)}</p>
          {onOpenDocuments && (
            <button
              type="button"
              onClick={onOpenDocuments}
              className="text-[10px] font-semibold text-[color:var(--brand)] hover:underline mt-1"
            >
              Dokumente prüfen →
            </button>
          )}
        </div>
      </DataCard>

      <DataCard title="Finanzielle Belastung" className="p-4">
        <div className="space-y-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Offene Rechnungen</span>
            <span className="font-semibold">{openInvoices}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Überfällig</span>
            <span className={`font-semibold ${overdueInvoices > 0 ? 'text-[color:var(--status-critical)]' : ''}`}>
              {overdueInvoices}
            </span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Offene Bußgelder</span>
            <span className="font-semibold">{openFines}</span>
          </div>
          <div className="flex justify-between text-[11px] pt-1 border-t border-border">
            <span className="text-muted-foreground">Gesamtumsatz</span>
            <span className="font-semibold">
              {totalRevenueCents > 0 ? formatCurrencyCents(totalRevenueCents) : EM_DASH}
            </span>
          </div>
        </div>
      </DataCard>

      <DataCard title="Mietverhalten" className="p-4">
        <div className="space-y-2">
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Buchungen</span>
            <span className="font-semibold">{totalBookings}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted-foreground">Letzte Buchung</span>
            <span className="font-semibold">{formatDate(lastBookingDate)}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] gap-2">
            <span className="text-muted-foreground">Fahrbelastung</span>
            {(() => {
              const display = formatStressScore(drivingStressScore, {
                hasEnoughData: hasEnoughData !== false,
                level: stressLevel ?? undefined,
              });
              if (display.isMissing) {
                return <span className="font-semibold">{EM_DASH}</span>;
              }
              return (
                <StatusChip tone={stressToneToStatusTone(display.tone)} className="text-[9px]">
                  {display.label}
                </StatusChip>
              );
            })()}
          </div>
          {(drivingEvents > 0 || abuseEvents > 0) && (
            <p className="text-[10px] text-muted-foreground pt-1">
              {drivingEvents} Fahrereignisse · {abuseEvents} Missbrauchsereignisse
            </p>
          )}
        </div>
      </DataCard>
    </div>
  );
}

function verificationTone(ui: ReturnType<typeof customerVerificationApiToUi>): StatusTone {
  if (ui === 'Verified') return 'success';
  if (ui === 'Pending Review') return 'warning';
  if (ui === 'Rejected' || ui === 'Expired') return 'critical';
  return 'neutral';
}
