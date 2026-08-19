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
import { useLanguage } from '../../../i18n/LanguageContext';
import {
  customerVerificationApiToUi,
  customerVerificationUiLabel,
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
import { cdv, customerVerificationTone } from './customer-detail-ui';

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
  const pool = [
    ...(eligibility?.globalBlockingReasons ?? []),
    ...(eligibility?.blockingReasons ?? []),
    ...(eligibility?.stages?.startPickup.blockingReasons ?? []),
    ...(eligibility?.stages?.confirmBooking.blockingReasons ?? []),
    ...(eligibility?.warnings ?? []),
  ];
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

function DecisionDetailsAction({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="link" size="sm" className={cdv.decisionCardAction} onClick={onClick}>
      {label}
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
  detailsLabel,
  children,
}: {
  icon: ReactNode;
  title: string;
  className?: string;
  onDetails?: () => void;
  detailsLabel: string;
  children: ReactNode;
}) {
  const cardTitle = <DecisionCardTitle icon={icon} label={title} />;

  return (
    <DataCard
      flush
      className={cn(cdv.decisionCard, className)}
      title={cardTitle}
      actions={onDetails ? <DecisionDetailsAction onClick={onDetails} label={detailsLabel} /> : undefined}
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
  const { t, locale } = useLanguage();

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
        openInvoices > 0 ? t('customers.detail.decisions.countOpen', { count: openInvoices }) : null,
        overdueInvoices > 0
          ? t('customers.detail.decisions.countOverdue', { count: overdueInvoices })
          : null,
        openFines > 0 ? t('customers.detail.decisions.countFines', { count: openFines }) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : t('customers.detail.decisions.noOpenItems');

  const drivingHasSignals = drivingEvents > 0 || abuseEvents > 0;
  const verificationHint = resolveVerificationHint(eligibility, licenseUi);

  const clearanceTone = eligibility ? overallRentalClearanceTone(eligibility) : 'neutral';
  const clearanceIcon =
    clearanceTone === 'critical' ? (
      <ShieldAlert className="size-3.5" />
    ) : (
      <Shield className="size-3.5" />
    );

  const primaryReason =
    eligibility?.stages?.startPickup.blockingReasons[0] ??
    eligibility?.stages?.confirmBooking.blockingReasons[0] ??
    eligibility?.globalBlockingReasons?.[0] ??
    eligibility?.blockingReasons[0] ??
    eligibility?.warnings[0] ??
    null;
  const primaryReasonIsWarning =
    !eligibility?.globalBlockingReasons?.[0] &&
    !eligibility?.blockingReasons[0] &&
    !eligibility?.stages?.confirmBooking.blockingReasons[0] &&
    !eligibility?.stages?.startPickup.blockingReasons[0] &&
    Boolean(eligibility?.warnings[0]);

  const stageItems: { label: string; stage: EligibilityStage }[] = [
    { label: t('customers.detail.decisions.stage.create'), stage: createStage },
    { label: t('customers.detail.decisions.stage.confirm'), stage: confirmStage },
    { label: t('customers.detail.decisions.stage.pickup'), stage: pickupStage },
  ];

  const detailsLabel = t('common.details');

  return (
    <div className={cdv.decisionSectionGrid}>
      <DecisionSummaryCard
        icon={clearanceIcon}
        title={t('customers.detail.decisions.clearance')}
        className={cdv.decisionCardPrimary}
        detailsLabel={detailsLabel}
      >
        {eligibilityLoading ? (
          <p className={cdv.decisionMutedText}>{t('customers.detail.decisions.loading')}</p>
        ) : eligibilityError ? (
          <div className="space-y-2" title={eligibilityError}>
            <p className="text-[12px] font-medium text-foreground">
              {t('customers.detail.eligibilityLoadError')}
            </p>
            {onRetryEligibility ? (
              <Button
                type="button"
                size="sm"
                variant="neutral"
                className="h-8"
                onClick={onRetryEligibility}
              >
                {t('customers.detail.decisions.reload')}
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
          <p className={cdv.decisionMutedText}>{t('customers.detail.decisions.noClearanceData')}</p>
        )}
      </DecisionSummaryCard>

      <DecisionSummaryCard
        icon={<BadgeCheck className="size-3.5" />}
        title={t('customers.detail.decisions.verification')}
        className={cdv.decisionCardSecondary}
        onDetails={onOpenDocuments}
        detailsLabel={detailsLabel}
      >
        <div className={cdv.decisionChipStack}>
          <DecisionChip tone={customerVerificationTone(idUi)} dot>
            {t('customers.detail.decisions.idPrefix')} {customerVerificationUiLabel(idUi, locale)}
          </DecisionChip>
          <DecisionChip tone={customerVerificationTone(licenseUi)} dot>
            {t('customers.detail.decisions.licensePrefix')} {customerVerificationUiLabel(licenseUi, locale)}
          </DecisionChip>
        </div>
        {verificationHint ? <p className={cdv.decisionMutedText}>{verificationHint}</p> : null}
      </DecisionSummaryCard>

      <DecisionSummaryCard
        icon={<Wallet className="size-3.5" />}
        title={t('customers.detail.decisions.finances')}
        className={cdv.decisionCardSecondary}
        onDetails={onOpenFinances}
        detailsLabel={detailsLabel}
      >
        <DecisionChip tone={financeTone} dot>
          {financeSummary}
        </DecisionChip>
        {!financeHasIssues ? (
          <p className={cdv.decisionMutedText}>{t('customers.detail.decisions.financesOverview')}</p>
        ) : null}
      </DecisionSummaryCard>

      <DecisionSummaryCard
        icon={<Gauge className="size-3.5" />}
        title={t('customers.detail.decisions.drivingLoad')}
        className={cdv.decisionCardSecondaryWide}
        onDetails={onOpenDriving}
        detailsLabel={detailsLabel}
      >
        <div className={cdv.decisionChipStack}>
          {stressDisplay.isMissing ? (
            <DecisionChip tone="noData">{t('customers.detail.decisions.noDrivingData')}</DecisionChip>
          ) : (
            <DecisionChip tone={stressToneToStatusTone(stressDisplay.tone)} dot>
              {stressDisplay.label}
            </DecisionChip>
          )}
          {drivingHasSignals ? (
            <p className={cdv.decisionMutedText}>
              {t('customers.detail.decisions.eventsSummary', {
                events: drivingEvents,
                abuse: abuseEvents,
              })}
            </p>
          ) : null}
        </div>
      </DecisionSummaryCard>
    </div>
  );
}
