import { Fragment, type ReactNode } from 'react';
import { ChevronRight, Gauge, Receipt, Shield, ShieldCheck } from 'lucide-react';

import { DataCard, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import type { CustomerEligibility } from './customerDetailTypes';
import {
  eligibilityStageForConfirm,
  eligibilityStageForCreate,
  eligibilityStageForPickup,
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

function DecisionCardTitle({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <span className={cdv.decisionCardTitleRow}>
      <span className={cdv.decisionCardTitleIcon}>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function DecisionDetailsAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="link"
      size="sm"
      className={cdv.decisionCardDetailsLink}
      onClick={onClick}
    >
      {label}
      <ChevronRight className="size-3" />
    </Button>
  );
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

  const stageItems = [
    { label: 'Erstellen', stage: createStage },
    { label: 'Bestätigen', stage: confirmStage },
    { label: 'Übergabe', stage: pickupStage },
  ];

  return (
    <div className={cdv.sectionGrid}>
      <DataCard
        className={cdv.decisionCard}
        title={<DecisionCardTitle icon={<Shield className="size-3.5" />} label="Mietfreigabe" />}
        bodyClassName={cdv.decisionCardBody}
      >
        {eligibilityLoading ? (
          <p className="text-[12px] text-muted-foreground">Wird geladen…</p>
        ) : eligibilityError ? (
          <div className="space-y-2" title={eligibilityError}>
            <p className="text-[12px] font-medium text-foreground">{ELIGIBILITY_LOAD_ERROR_USER}</p>
            {onRetryEligibility ? (
              <Button type="button" size="sm" variant="neutral" className="h-8" onClick={onRetryEligibility}>
                Erneut laden
              </Button>
            ) : null}
          </div>
        ) : eligibility ? (
          <>
            <StatusChip tone={overallRentalClearanceTone(eligibility)} dot>
              {overallRentalClearanceLabel(eligibility)}
            </StatusChip>
            {eligibility.blockingReasons[0] ? (
              <p className={cdv.decisionCardReason}>{eligibility.blockingReasons[0]}</p>
            ) : eligibility.warnings[0] ? (
              <p className={cdv.decisionCardReasonWarning}>{eligibility.warnings[0]}</p>
            ) : null}
            <div className={cdv.stageRow}>
              {stageItems.map((row, index) => (
                <Fragment key={row.label}>
                  {index > 0 ? <span className={cdv.stageSeparator}>·</span> : null}
                  <span className={cdv.stageItem}>
                    <span className={cn('size-1.5 shrink-0 rounded-full', stageDotClass(row.stage))} />
                    {row.label}
                  </span>
                </Fragment>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">Keine Freigabedaten</p>
        )}
      </DataCard>

      <DataCard
        className={cdv.decisionCard}
        title={<DecisionCardTitle icon={<ShieldCheck className="size-3.5" />} label="Verifikation" />}
        actions={
          onOpenDocuments ? (
            <DecisionDetailsAction label="Details" onClick={onOpenDocuments} />
          ) : undefined
        }
        bodyClassName={cdv.decisionCardBody}
      >
        <div className={cdv.decisionCardChipStack}>
          <StatusChip tone={customerVerificationTone(idUi)} dot>
            Ausweis: {customerVerificationUiLabelDe(idUi)}
          </StatusChip>
          <StatusChip tone={customerVerificationTone(licenseUi)} dot>
            FS: {customerVerificationUiLabelDe(licenseUi)}
          </StatusChip>
        </div>
      </DataCard>

      <DataCard
        className={cdv.decisionCard}
        title={<DecisionCardTitle icon={<Receipt className="size-3.5" />} label="Finanzen" />}
        actions={
          onOpenFinances ? (
            <DecisionDetailsAction label="Details" onClick={onOpenFinances} />
          ) : undefined
        }
        bodyClassName={cdv.decisionCardBody}
      >
        <StatusChip tone={financeTone} dot>
          {financeSummary}
        </StatusChip>
      </DataCard>

      <DataCard
        className={cdv.decisionCard}
        title={<DecisionCardTitle icon={<Gauge className="size-3.5" />} label="Fahrbelastung" />}
        actions={
          onOpenDriving ? (
            <DecisionDetailsAction label="Details" onClick={onOpenDriving} />
          ) : undefined
        }
        bodyClassName={cdv.decisionCardBody}
      >
        <div className={cdv.decisionCardChipStack}>
          {stressDisplay.isMissing ? (
            <StatusChip tone="noData">Keine Fahrdaten vorhanden</StatusChip>
          ) : (
            <StatusChip tone={stressToneToStatusTone(stressDisplay.tone)} dot>
              {stressDisplay.label}
            </StatusChip>
          )}
          {drivingHasSignals ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              {drivingEvents} Ereignisse · {abuseEvents} Missbrauch
            </p>
          ) : null}
        </div>
      </DataCard>
    </div>
  );
}
