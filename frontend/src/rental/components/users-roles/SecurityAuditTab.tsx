import { EmptyState, MetricCard, SkeletonMetricGrid } from '../../../components/patterns';
import type { IamSecurityOverviewDto } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { MfaStateBadge, RiskBadge } from './IamBadges';
import { formatDateTime } from './iam-team.utils';
import type { IamMfaState } from '../../../lib/api';

interface SecurityAuditTabProps {
  security: IamSecurityOverviewDto | null;
  loading: boolean;
}

const MFA_STATES: IamMfaState[] = [
  'ENABLED',
  'DISABLED',
  'REQUIRED',
  'ACTION_REQUIRED',
  'UNKNOWN',
  'NOT_SUPPORTED',
];

export function SecurityAuditTab({ security, loading }: SecurityAuditTabProps) {
  const { t, locale } = useLanguage();

  if (loading && !security) {
    return <SkeletonMetricGrid count={4} />;
  }

  if (!security) {
    return <EmptyState title="No security data" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label={t('iam.security.sessions')} value={security.activeSessions} />
        <MetricCard label={t('iam.kpi.privileged')} value={security.privilegedAccounts} />
        <MetricCard
          label={t('iam.kpi.reviewRequired')}
          value={security.reviewRequired}
          status={security.reviewRequired > 0 ? 'warning' : 'neutral'}
        />
        <MetricCard label={t('iam.security.audit')} value={security.iamAudit.length} />
      </div>

      <section className="rounded-2xl border border-border p-4 space-y-3">
        <h3 className="text-[14px] font-semibold">{t('iam.security.mfaSummary')}</h3>
        <div className="flex flex-wrap gap-2">
          {MFA_STATES.map((state) => (
            <div key={state} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-[12px]">
              <MfaStateBadge state={state} />
              <span className="tabular-nums font-semibold">{security.mfaSummary[state] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4 space-y-3">
        <h3 className="text-[14px] font-semibold">{t('iam.security.privileged')}</h3>
        <ul className="space-y-2">
          {security.privilegedMembers.map((m) => (
            <li key={m.membershipId} className="flex items-center justify-between gap-3 text-[13px] rounded-xl bg-muted/30 px-3 py-2">
              <div>
                <div className="font-medium">{m.displayName}</div>
                <div className="text-muted-foreground text-[12px]">{m.email}</div>
              </div>
              <div className="flex gap-2">
                <RiskBadge level={m.riskClassification} />
                <MfaStateBadge state={m.mfaState} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-border p-4 space-y-3">
        <h3 className="text-[14px] font-semibold">{t('iam.security.audit')}</h3>
        <ul className="space-y-2 max-h-[360px] overflow-y-auto">
          {security.iamAudit.map((row) => (
            <li key={row.id} className="text-[12px] border-b border-border/60 pb-2">
              <div className="font-medium">{row.description}</div>
              <div className="text-muted-foreground tabular-nums">{formatDateTime(row.createdAt, locale)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
