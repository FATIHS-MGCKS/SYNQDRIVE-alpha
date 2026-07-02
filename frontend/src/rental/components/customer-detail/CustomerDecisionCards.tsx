import { DataCard, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import type { CustomerEligibility } from './customerDetailTypes';
import {
  eligibilityStageForConfirm,
  eligibilityStageForCreate,
  eligibilityStageForPickup,
  EM_DASH,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
} from './customerDetailUtils';
import { formatStressScore, stressToneToStatusTone } from '../../lib/scoreFormat';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
} from '../../lib/entityMappers';
import { cdv, customerVerificationTone, ELIGIBILITY_LOAD_ERROR_USER } from './customer-detail-ui';

function stageDotClass(stage: 'allowed' | 'warning' | 'blocked'): string {
  if (stage === 'allowed') return 'bg-[color:var(--status-positive)]';
  if (stage === 'warning') return 'bg-[color:var(--status-attention)]';
  return 'bg-[color:var(--status-critical)]';
}

interface CustomerDecisionCardsProps {
  eligibility: CustomerEligibility | null;
  eligibilityLoading?: boolean;
  eligibilityError?: string | null;
  onRetryEligibility?: () => void;
  idVerificationStatus?: string | null;
  licenseVerificationStatus?: string | null;
  onOpenDocuments?: () => void;
  onOpenFinances?: () => void;
  onOpenDriving?: () => void;
  openInvoices: number;
  overdueInvoices: number;
  openFines: number;
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
  onOpenDocuments,
  onOpenFinances,
  onOpenDriving,
  openInvoices,
  overdueInvoices,
  openFines,
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

  const financeHasIssues = openInvoices > 0 || overdueInvoices > 0 || openFines > 0;
  const financeTone: StatusTone =
    overdueInvoices > 0 ? 'critical' : financeHasIssues ? 'warning' : 'success';
  const financeSummary = financeHasIssues
    ? [
        openInvoices > 0 ? `${openInvoices} offen` : null,
        overdueInvoices > 0 ? `${overdueInvoices} überfällig` : null,
        openFines > 0 ? `${openFines} Bußgelder` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Keine offenen Posten';

  const drivingHasSignals = drivingEvents > 0 || abuseEvents > 0;

  return (
    <div className={cdv.sectionGrid}>
      <DataCard title="Mietfreigabe" bodyClassName="py-2.5">
        {eligibilityLoading ? (
          <p className="text-[12px] text-muted-foreground">Wird geladen…</p>
        ) : eligibilityError ? (
          <div className="space-y-2" title={eligibilityError}>
            <p className="text-[12px] font-medium text-foreground">{ELIGIBILITY_LOAD_ERROR_USER}</p>
            {onRetryEligibility ? (
              <Button type="button" size="sm" variant="neutral" className="h-7" onClick={onRetryEligibility}>
                Erneut laden
              </Button>
            ) : null}
          </div>
        ) : eligibility ? (
          <div className="space-y-2">
            <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
              {overallRentalClearanceLabel(eligibility)}
            </StatusChip>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {[
                { label: 'Erstellen', stage: createStage },
                { label: 'Bestätigen', stage: confirmStage },
                { label: 'Übergabe', stage: pickupStage },
              ].map((row) => (
                <span key={row.label} className="inline-flex items-center gap-1">
                  <span className={`size-1.5 shrink-0 rounded-full ${stageDotClass(row.stage)}`} />
                  {row.label}
                </span>
              ))}
            </div>
            {eligibility.blockingReasons[0] ? (
              <p className="text-[11px] leading-snug text-[color:var(--status-critical)]">
                {eligibility.blockingReasons[0]}
              </p>
            ) : eligibility.warnings[0] ? (
              <p className="text-[11px] leading-snug text-[color:var(--status-attention)]">
                {eligibility.warnings[0]}
              </p>
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
              Details
            </Button>
          ) : undefined
        }
        bodyClassName="py-2.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusChip tone={customerVerificationTone(idUi)} className="text-[10px]">
            Ausweis: {customerVerificationUiLabelDe(idUi)}
          </StatusChip>
          <StatusChip tone={customerVerificationTone(licenseUi)} className="text-[10px]">
            FS: {customerVerificationUiLabelDe(licenseUi)}
          </StatusChip>
        </div>
      </DataCard>

      <DataCard
        title="Finanzen"
        actions={
          onOpenFinances ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={onOpenFinances}
            >
              Details
            </Button>
          ) : undefined
        }
        bodyClassName="py-2.5"
      >
        <StatusChip tone={financeTone} dot className="text-[10px]">
          {financeSummary}
        </StatusChip>
      </DataCard>

      <DataCard
        title="Fahrbelastung"
        actions={
          onOpenDriving ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={onOpenDriving}
            >
              Details
            </Button>
          ) : undefined
        }
        bodyClassName="py-2.5"
      >
        <div className="space-y-1.5">
          {stressDisplay.isMissing ? (
            <span className="text-[12px] text-muted-foreground">{EM_DASH}</span>
          ) : (
            <StatusChip tone={stressToneToStatusTone(stressDisplay.tone)} className="text-[10px]">
              {stressDisplay.label}
            </StatusChip>
          )}
          {drivingHasSignals ? (
            <p className="text-[11px] text-muted-foreground">
              {drivingEvents} Ereignisse · {abuseEvents} Missbrauch
            </p>
          ) : null}
        </div>
      </DataCard>
    </div>
  );
}
