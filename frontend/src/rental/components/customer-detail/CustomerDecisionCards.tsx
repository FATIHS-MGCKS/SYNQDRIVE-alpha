import type { ReactNode } from 'react';
import {
  BadgeCheck,
  ChevronRight,
  Gauge,
  Shield,
  ShieldAlert,
  Wallet,
} from 'lucide-react';

import { DataCard, StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabelDe,
  type CustomerUiVerification,
} from '../../lib/entityMappers';
import { formatStressScore, stressToneToStatusTone } from '../../lib/scoreFormat';
import type { CustomerEligibility } from './customerDetailTypes';
import {
  eligibilityStageForConfirm,
  eligibilityStageForCreate,
  eligibilityStageForPickup,
  overallRentalClearanceLabel,
  overallRentalClearanceTone,
} from './customerDetailUtils';
import { cdv, customerVerificationTone, ELIGIBILITY_LOAD_ERROR_USER } from './customer-detail-ui';

type EligibilityStage = 'allowed' | 'warning' | 'blocked';

function stageDotClass(stage: EligibilityStage): string {
  if (stage === 'allowed') return 'bg-[color:var(--status-positive)]';
  if (stage === 'warning') return 'bg-[color:var(--status-attention)]';
  return 'bg-[color:var(--status-critical)]';
}

function resolveVerificationHint(
  eligibility: CustomerEligibility | null,
  licenseUi: CustomerUiVerification,
): string | null {
  if (licenseUi === 'Verified') return null;
  const pool = [...(eligibility?.blockingReasons ?? []), ...(eligibility?.warnings ?? [])];
  return (
    pool.find((text) => /führerschein|fuehrerschein|pickup/i.test(text.toLowerCase())) ?? null
  );
}

function DecisionCardTitle({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className={cdv.decisionCardTitleRow}>
      <span className={cdv.decisionCardIconBubble}>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function DecisionDetailsAction({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="link" size="sm" className={cdv.decisionCardAction} onClick={onClick}>
      Details
      <ChevronRight className="size-3" />
    </Button>
  );
}

function DecisionChip({
  tone,
  dot,
  children,
}: {
  tone?: StatusTone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <StatusChip tone={tone} dot={dot} className={cdv.decisionChip}>
      {children}
    </StatusChip>
  );
}

function DecisionStageRail({ stages }: { stages: { label: string; stage: EligibilityStage }[] }) {
  return (
    <div className={cdv.stageRail}>
      {stages.map((row, index) => (
        <div key={row.label} className={cdv.stageRailItem}>
          <div className={cdv.stageRailTrack}>
            {index > 0 ? <span className={cdv.stageRailLine} aria-hidden /> : null}
            <span className={cn(cdv.stageRailDot, stageDotClass(row.stage))} aria-hidden />
            {index < stages.length - 1 ? <span className={cdv.stageRailLine} aria-hidden /> : null}
          </div>
          <span className={cdv.stageRailLabel}>{row.label}</span>
        </div>
      ))}
    </div>
  );
}

function DecisionSummaryCard({
  icon,
  title,
  className,
  onDetails,
  children,
}: {
  icon: ReactNode;
  title: string;
  className?: string;
  onDetails?: () => void;
  children: ReactNode;
}) {
  return (
    <DataCard
      flush
      className={cn(cdv.decisionCard, className)}
      title={<DecisionCardTitle icon={icon} label={title} />}
      actions={onDetails ? <DecisionDetailsAction onClick={onDetails} /> : undefined}
      bodyClassName={cdv.decisionCardBody}
    >
      {children}
    </DataCard>
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
  const verificationHint = resolveVerificationHint(eligibility, licenseUi);

  const clearanceTone = eligibility ? overallRentalClearanceTone(eligibility) : 'neutral';
  const clearanceIcon =
    clearanceTone === 'critical' ? (
      <ShieldAlert className="size-3.5" />
    ) : (
      <Shield className="size-3.5" />
    );

  const primaryReason = eligibility?.blockingReasons[0] ?? eligibility?.warnings[0] ?? null;
  const primaryReasonIsWarning =
    !eligibility?.blockingReasons[0] && Boolean(eligibility?.warnings[0]);

  const stageItems: { label: string; stage: EligibilityStage }[] = [
    { label: 'Erstellen', stage: createStage },
    { label: 'Bestätigen', stage: confirmStage },
    { label: 'Übergabe', stage: pickupStage },
  ];

  return (
    <div className={cdv.decisionSectionGrid}>
      <DecisionSummaryCard
        icon={clearanceIcon}
        title="Mietfreigabe"
        className={cdv.decisionCardPrimary}
      >
        {eligibilityLoading ? (
          <p className={cdv.decisionMutedText}>Wird geladen…</p>
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
            <DecisionChip tone={overallRentalClearanceTone(eligibility)} dot>
              {overallRentalClearanceLabel(eligibility)}
            </DecisionChip>
            {primaryReason ? (
              <p
                className={
                  primaryReasonIsWarning ? cdv.decisionDescriptionWarning : cdv.decisionDescription
                }
              >
                {primaryReason}
              </p>
            ) : null}
            <DecisionStageRail stages={stageItems} />
          </>
        ) : (
          <p className={cdv.decisionMutedText}>Keine Freigabedaten</p>
        )}
      </DecisionSummaryCard>

      <DecisionSummaryCard
        icon={<BadgeCheck className="size-3.5" />}
        title="Verifikation"
        className={cdv.decisionCardSecondary}
        onDetails={onOpenDocuments}
      >
        <div className={cdv.decisionChipStack}>
          <DecisionChip tone={customerVerificationTone(idUi)} dot>
            Ausweis: {customerVerificationUiLabelDe(idUi)}
          </DecisionChip>
          <DecisionChip tone={customerVerificationTone(licenseUi)} dot>
            FS: {customerVerificationUiLabelDe(licenseUi)}
          </DecisionChip>
        </div>
        {verificationHint ? <p className={cdv.decisionMutedText}>{verificationHint}</p> : null}
      </DecisionSummaryCard>

      <DecisionSummaryCard
        icon={<Wallet className="size-3.5" />}
        title="Finanzen"
        className={cdv.decisionCardSecondary}
        onDetails={onOpenFinances}
      >
        <DecisionChip tone={financeTone} dot>
          {financeSummary}
        </DecisionChip>
        {!financeHasIssues ? (
          <p className={cdv.decisionMutedText}>Rechnungen und Gebühren im Überblick</p>
        ) : null}
      </DecisionSummaryCard>

      <DecisionSummaryCard
        icon={<Gauge className="size-3.5" />}
        title="Fahrbelastung"
        className={cdv.decisionCardSecondaryWide}
        onDetails={onOpenDriving}
      >
        <div className={cdv.decisionChipStack}>
          {stressDisplay.isMissing ? (
            <DecisionChip tone="noData">Keine Fahrdaten vorhanden</DecisionChip>
          ) : (
            <DecisionChip tone={stressToneToStatusTone(stressDisplay.tone)} dot>
              {stressDisplay.label}
            </DecisionChip>
          )}
          {drivingHasSignals ? (
            <p className={cdv.decisionMutedText}>
              {drivingEvents} Ereignisse · {abuseEvents} Auffälligkeiten
            </p>
          ) : null}
        </div>
      </DecisionSummaryCard>
    </div>
  );
}
