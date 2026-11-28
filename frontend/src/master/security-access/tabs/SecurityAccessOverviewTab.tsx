import { ShieldAlert, ShieldOff, Users } from 'lucide-react';
import { MetricCard, DataCard, StatusChip } from '../../../components/patterns';
import { MasterErrorState, MasterLoadingState, MasterStaleDataHint } from '../../shell';
import { useSecurityAttentionSummary } from '../useSecurityAccess';
import { useSecurityAccessPresentation } from '../useSecurityAccessPresentation';
import { attentionCodeIcon, attentionCodeTone } from '../security-access.utils';
import type { SecurityAccessSection } from '../types';

interface SecurityAccessOverviewTabProps {
  onNavigateSection: (section: SecurityAccessSection) => void;
  onOpenUser: (userId: string) => void;
  onOpenAudit: (auditId: string) => void;
}

export function SecurityAccessOverviewTab({
  onNavigateSection,
  onOpenUser,
}: SecurityAccessOverviewTabProps) {
  const { t, attentionCodeLabel, formatRelative, loadError } = useSecurityAccessPresentation();
  const summary = useSecurityAttentionSummary(loadError);

  if (summary.loading && !summary.data) {
    return <MasterLoadingState variant="card" count={2} />;
  }

  if (summary.error) {
    return (
      <MasterErrorState
        title={t('master.securityAccess.hub.overviewErrorTitle')}
        error={summary.error}
        onRetry={() => void summary.refresh()}
      />
    );
  }

  const data = summary.data;
  const mfaMissing = data?.byCode.MFA_MISSING ?? 0;

  return (
    <div className="space-y-5">
      {summary.isStale && data && (
        <MasterStaleDataHint
          label={t('master.securityAccess.overview.staleHint', { relative: formatRelative(data.generatedAt) })}
          onRefresh={() => void summary.refresh()}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label={t('master.securityAccess.overview.metricMfaMissingAdmins')}
          value={mfaMissing}
          status={mfaMissing > 0 ? 'critical' : 'success'}
          icon={<ShieldOff className="h-4 w-4" />}
          onClick={() => onNavigateSection('master-admins')}
          className={mfaMissing > 0 ? 'cursor-pointer' : undefined}
        />
        <MetricCard
          label={t('master.securityAccess.overview.metricAttentionTotal')}
          value={data?.total ?? 0}
          status={(data?.total ?? 0) > 0 ? 'warning' : 'neutral'}
          icon={<ShieldAlert className="h-4 w-4" />}
          onClick={() => onNavigateSection('overview')}
        />
        <MetricCard
          label={t('master.securityAccess.overview.metricPrivilegeChanges24h')}
          value={data?.byCode.PRIVILEGE_CHANGED ?? 0}
          status="info"
          onClick={() => onNavigateSection('audit')}
        />
        <MetricCard
          label={t('master.securityAccess.overview.metricMfaPolicyActive')}
          value={data?.mfaMasterAdminPolicyEnabled ? t('master.securityAccess.common.yes') : t('master.securityAccess.common.no')}
          status={data?.mfaMasterAdminPolicyEnabled ? 'success' : 'neutral'}
        />
      </div>

      {mfaMissing > 0 && (
        <DataCard title={t('master.securityAccess.overview.mfaWarningTitle')}>
          <p className="text-sm text-foreground mb-3">
            {mfaMissing === 1
              ? t('master.securityAccess.overview.mfaWarningBodyOne')
              : t('master.securityAccess.overview.mfaWarningBodyMany', { count: String(mfaMissing) })}
          </p>
          <button
            type="button"
            className="text-sm font-semibold text-primary hover:underline"
            onClick={() => onNavigateSection('master-admins')}
          >
            {t('master.securityAccess.overview.mfaWarningShowAdmins')}
          </button>
        </DataCard>
      )}

      <DataCard title={t('master.securityAccess.overview.openAttentionTitle')} flush bodyClassName="p-0">
        {!data?.topItems.length ? (
          <p className="p-4 text-sm text-muted-foreground">{t('master.securityAccess.overview.openAttentionEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.topItems.map((item) => {
              const Icon = attentionCodeIcon(item.code);
              return (
                <li key={`${item.code}-${item.userId}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
                    onClick={() => onOpenUser(item.userId)}
                  >
                    <StatusChip tone={attentionCodeTone(item.code)} icon={<Icon className="h-3 w-3" />}>
                      {attentionCodeLabel(item.code)}
                    </StatusChip>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{item.displayName}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.message}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </DataCard>

      <DataCard title={t('master.securityAccess.overview.quickAccessTitle')}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['users', t('master.securityAccess.overview.quickAccessManageUsers'), Users],
              ['master-admins', t('master.securityAccess.overview.quickAccessPlatformAdmins'), ShieldAlert],
              ['own-security', t('master.securityAccess.overview.quickAccessOwnSecurity'), ShieldOff],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              className="sq-btn-secondary flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
              onClick={() => onNavigateSection(id)}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        {data?.generatedAt && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {t('master.securityAccess.overview.asOfRelative', { relative: formatRelative(data.generatedAt) })}
          </p>
        )}
      </DataCard>
    </div>
  );
}