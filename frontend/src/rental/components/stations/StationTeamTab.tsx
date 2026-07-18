import { useMemo } from 'react';
import { Shield, UserCog, Users } from 'lucide-react';
import type { StationTeamDto } from '../../../lib/api';
import { StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import { resolveStationTabFetchState } from '../../lib/station-view-state';
import { StationFetchStateBoundary } from './StationViewStateBoundary';

interface StationTeamTabProps {
  team: StationTeamDto | null;
  loading: boolean;
  error: unknown | null;
  canManageTeam: boolean;
  onRetry?: () => void;
  onManageTeam?: () => void;
}

export function StationTeamTab({
  team,
  loading,
  error,
  canManageTeam,
  onRetry,
  onManageTeam,
}: StationTeamTabProps) {
  const { t } = useLanguage();

  const resolution = useMemo(
    () =>
      resolveStationTabFetchState({
        loading,
        error,
        itemCount: team?.staff.length ?? 0,
        fallbackMessage: t('stations.detail.teamError'),
      }),
    [error, loading, t, team?.staff.length],
  );

  if (!team?.wired) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">{t('stations.detail.teamTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t('stations.detail.teamDescription')}</p>
        </div>
        {canManageTeam && onManageTeam ? (
          <button
            type="button"
            onClick={onManageTeam}
            className="text-xs font-semibold text-[color:var(--brand)] hover:underline shrink-0"
          >
            {t('stations.detail.teamManage')}
          </button>
        ) : null}
      </div>

      {(team.managerName || team.phone || team.email) && (
        <div className="surface-premium p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {team.managerName ? (
            <ContactField label={t('stations.detail.teamContact')} value={team.managerName} />
          ) : null}
          {team.phone ? <ContactField label={t('stations.form.phone')} value={team.phone} /> : null}
          {team.email ? <ContactField label={t('stations.form.email')} value={team.email} /> : null}
        </div>
      )}

      <StationFetchStateBoundary
        resolution={resolution}
        onRetry={onRetry}
        emptyIcon={<Users className="w-8 h-8" />}
        emptyTitleKey="stations.detail.teamEmptyTitle"
        emptyDescriptionKey="stations.detail.teamEmptyDescription"
      >
        <div className="surface-premium overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3 font-semibold">{t('stations.detail.teamMember')}</th>
                  <th className="p-3 font-semibold">{t('stations.detail.teamRole')}</th>
                  <th className="p-3 font-semibold">{t('stations.detail.teamScope')}</th>
                </tr>
              </thead>
              <tbody>
                {team.staff.map((member) => (
                  <tr key={member.membershipId} className="border-b border-border/50 last:border-0">
                    <td className="p-3 font-medium">{member.displayName}</td>
                    <td className="p-3">
                      <StatusChip tone="neutral">
                        {member.roleLabel ?? t(`stations.detail.teamRoleValue.${member.role}` as TranslationKey)}
                      </StatusChip>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Shield className="h-3.5 w-3.5" aria-hidden />
                        {member.scopeLabel}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden divide-y divide-border">
            {team.staff.map((member) => (
              <div key={member.membershipId} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{member.displayName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {member.roleLabel ?? t(`stations.detail.teamRoleValue.${member.role}` as TranslationKey)}
                    </div>
                  </div>
                  <StatusChip tone="info">{member.scopeLabel}</StatusChip>
                </div>
              </div>
            ))}
          </div>
        </div>
      </StationFetchStateBoundary>

      {canManageTeam ? (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <UserCog className="h-3.5 w-3.5" aria-hidden />
          {t('stations.detail.teamManageHint')}
        </p>
      ) : null}
    </div>
  );
}

function ContactField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}
