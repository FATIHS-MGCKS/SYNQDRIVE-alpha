import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, SkeletonRows } from '../../../components/patterns';
import { api, type IamRoleListItemDto, type IamRoleDetailDto } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { CollapsiblePermissions } from './PermissionEditor';
import { RiskBadge } from './IamBadges';
import { formatDateTime } from './iam-team.utils';

interface RolesAccessTabProps {
  orgId: string;
  roles: IamRoleListItemDto[];
  loading: boolean;
}

export function RolesAccessTab({ orgId, roles, loading }: RolesAccessTabProps) {
  const { t, locale } = useLanguage();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IamRoleDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void api.iam
      .roleDetail(orgId, selectedId)
      .then(setDetail)
      .finally(() => setDetailLoading(false));
  }, [orgId, selectedId]);

  if (loading) return <SkeletonRows rows={6} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
      <div className="space-y-2">
        {roles.length === 0 ? (
          <EmptyState title="No roles" />
        ) : (
          roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => setSelectedId(role.id)}
              className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedId === role.id ? 'border-[var(--brand)] bg-[var(--brand)]/5' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[14px]">{role.name}</span>
                <RiskBadge level={role.riskClassification} />
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">
                {role.assignmentCount} {t('iam.roles.assignments')}
                {role.pinned ? ' · pinned' : ''}
                {role.followsLatest ? ' · follows latest' : ''}
              </div>
            </button>
          ))
        )}
      </div>

      <div className="rounded-2xl border border-border p-5 min-h-[320px]">
        {!selectedId ? (
          <div className="text-[13px] text-muted-foreground">Select a role</div>
        ) : detailLoading || !detail ? (
          <SkeletonRows rows={5} />
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="text-[16px] font-semibold">{detail.name}</h3>
              <p className="text-[13px] text-muted-foreground">{detail.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-muted-foreground">{t('iam.roles.version')}</div>
                <div className="tabular-nums">{formatDateTime(detail.roleVersion, locale)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">{t('iam.roles.assignments')}</div>
                <div>{detail.impactPreview.affectedMemberCount}</div>
              </div>
            </div>
            <div className="rounded-xl bg-muted/40 p-3 text-[12px]">
              <div className="font-semibold mb-1">{t('iam.roles.impact')}</div>
              <div>{detail.impactPreview.privilegedCapabilities.join(', ') || '—'}</div>
              <div className="text-muted-foreground mt-1">Scope: {detail.impactPreview.stationScopeImpact}</div>
            </div>
            <CollapsiblePermissions permissions={detail.effectivePermissions ?? {}} disabled />
          </div>
        )}
      </div>
    </div>
  );
}
