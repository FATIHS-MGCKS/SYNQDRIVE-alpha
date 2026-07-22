import { Mail, MoreHorizontal, Search, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  MetricCard,
  SkeletonMetricGrid,
  SkeletonRows,
  type DataTableColumn,
} from '../../../components/patterns';
import { api, type IamTeamListItemDto } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { CreateUserWizard } from './CreateUserWizard';
import { MfaStateBadge, RiskBadge } from './IamBadges';
import { formatDateTime, getInitials } from './iam-team.utils';
import { TeamMemberDrawer } from './TeamMemberDrawer';
import type { IamTeamKpisDto } from '../../../lib/api';

interface TeamTabProps {
  orgId: string;
  team: IamTeamListItemDto[];
  kpis: IamTeamKpisDto | null;
  loading: boolean;
  error: string | null;
  onSearch: (q?: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenMember: (membershipId: string) => Promise<void>;
}

export function TeamTab({
  orgId,
  team,
  kpis,
  loading,
  error,
  onSearch,
  onRefresh,
  onOpenMember,
}: TeamTabProps) {
  const { t, locale } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const canWrite = hasPermission('users-roles', 'write');
  const [search, setSearch] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [drawerMembershipId, setDrawerMembershipId] = useState<string | null>(null);

  const members = useMemo(() => team.filter((i) => i.kind === 'MEMBER'), [team]);
  const invites = useMemo(() => team.filter((i) => i.kind === 'INVITE'), [team]);

  const columns: DataTableColumn<IamTeamListItemDto>[] = [
    {
      key: 'user',
      header: t('iam.col.user'),
      cell: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[12px] font-semibold">
            {getInitials(row.userSummary.displayName)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium text-[13px]">{row.userSummary.displayName}</div>
            <div className="truncate text-[12px] text-muted-foreground">{row.userSummary.email}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'access',
      header: t('iam.col.access'),
      cell: (row) => (
        <div className="space-y-1">
          <div className="text-[13px] font-medium">{row.effectiveRoleLabel ?? row.effectiveRole}</div>
          <RiskBadge level={row.riskClassification} />
        </div>
      ),
    },
    {
      key: 'scope',
      header: t('iam.col.scope'),
      cell: (row) => <span className="text-[13px] text-muted-foreground">{row.stationScopeSummary}</span>,
    },
    {
      key: 'security',
      header: t('iam.col.security'),
      cell: (row) => (
        <div className="space-y-1">
          <MfaStateBadge state={row.mfaState} />
          <div className="text-[11px] text-muted-foreground">
            {row.activeSessionCount} sessions
          </div>
        </div>
      ),
    },
    {
      key: 'activity',
      header: t('iam.col.lastActivity'),
      cell: (row) => (
        <span className="text-[13px] tabular-nums">{formatDateTime(row.lastActivityAt, locale)}</span>
      ),
    },
    {
      key: 'action',
      header: t('iam.col.action'),
      cell: (row) =>
        row.membershipId ? (
          <button
            type="button"
            className="text-[13px] font-semibold text-[var(--brand)] hover:underline"
            onClick={() => {
              setDrawerMembershipId(row.membershipId);
              void onOpenMember(row.membershipId!);
            }}
          >
            {t('iam.action.open')}
          </button>
        ) : (
          <span className="text-[12px] text-muted-foreground">{row.membershipStatus}</span>
        ),
    },
  ];

  if (error) {
    return <ErrorState error={error} onRetry={() => void onRefresh()} />;
  }

  return (
    <div className="space-y-5">
      {loading && !kpis ? (
        <SkeletonMetricGrid count={4} />
      ) : kpis ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard label={t('iam.kpi.activeUsers')} value={kpis.activeUsers} />
          <MetricCard label={t('iam.kpi.openInvites')} value={kpis.openInvites} />
          <MetricCard label={t('iam.kpi.privileged')} value={kpis.privilegedAccounts} />
          <MetricCard
            label={t('iam.kpi.reviewRequired')}
            value={kpis.reviewRequired}
            status={kpis.reviewRequired > 0 ? 'warning' : 'neutral'}
          />
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSearch(search);
            }}
            placeholder={t('iam.col.user')}
            className="w-full rounded-xl border border-border bg-background pl-10 pr-3 py-2.5 text-[13px]"
            aria-label={t('iam.col.user')}
          />
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            <UserPlus className="h-4 w-4" />
            {t('iam.action.invite')}
          </button>
        )}
      </div>

      <div className="hidden md:block">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : members.length === 0 ? (
          <EmptyState title={t('iam.empty.team')} />
        ) : (
          <DataTable
            columns={columns}
            rows={members}
            getRowKey={(r) => r.membershipId ?? r.inviteId ?? r.userSummary.email}
          />
        )}
      </div>

      <div className="md:hidden space-y-3">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : (
          members.map((row) => (
            <button
              key={row.membershipId ?? row.userSummary.email}
              type="button"
              className="w-full rounded-2xl border border-border p-4 text-left bg-card"
              onClick={() => {
                if (!row.membershipId) return;
                setDrawerMembershipId(row.membershipId);
                void onOpenMember(row.membershipId);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-[14px]">{row.userSummary.displayName}</div>
                  <div className="text-[12px] text-muted-foreground">{row.effectiveRoleLabel}</div>
                </div>
                <MfaStateBadge state={row.mfaState} />
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <RiskBadge level={row.riskClassification} />
                <span>{formatDateTime(row.lastActivityAt, locale)}</span>
              </div>
            </button>
          ))
        )}
      </div>

      {invites.length > 0 && (
        <section aria-labelledby="iam-invites-heading" className="rounded-2xl border border-border p-4 space-y-3">
          <h3 id="iam-invites-heading" className="text-[14px] font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4" />
            {t('iam.invite.section')}
          </h3>
          <ul className="space-y-2">
            {invites.map((inv) => (
              <li
                key={inv.inviteId ?? inv.userSummary.email}
                className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2 text-[13px]"
              >
                <span>{inv.userSummary.email}</span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{inv.effectiveRoleLabel}</span>
                  {canWrite && inv.inviteId && (
                    <button
                      type="button"
                      className="text-[var(--brand)] font-medium"
                      onClick={() => void api.organizationInvites.resend(orgId, inv.inviteId!)}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {wizardOpen && (
        <CreateUserWizard
          orgId={orgId}
          stations={[]}
          inviteOnly
          onClose={() => setWizardOpen(false)}
          onDone={() => {
            setWizardOpen(false);
            void onRefresh();
          }}
          onError={() => undefined}
        />
      )}

      {drawerMembershipId && (
        <TeamMemberDrawer
          orgId={orgId}
          membershipId={drawerMembershipId}
          open={Boolean(drawerMembershipId)}
          onOpenChange={(open) => {
            if (!open) setDrawerMembershipId(null);
          }}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
