import { useState } from 'react';
import { PageHeader } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { IAM_TABS, type IamTabId } from './iam-team.utils';
import { useIamTeam } from './useIamTeam';
import { TeamTab } from './TeamTab';
import { RolesAccessTab } from './RolesAccessTab';
import { SecurityAuditTab } from './SecurityAuditTab';
import type { UsersRolesTabProps } from './types';

export function UsersRolesTab({ orgId }: UsersRolesTabProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<IamTabId>('team');
  const {
    kpis,
    team,
    roles,
    security,
    loading,
    error,
    loadTeam,
    refreshAll,
    openMember,
  } = useIamTeam(orgId);

  if (!orgId?.trim()) {
    return (
      <div className="max-w-[1600px] mx-auto py-12 text-center text-[13px] text-muted-foreground">
        No organization loaded.
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-fade-up">
      <PageHeader title={t('iam.title')} />

      <div
        role="tablist"
        aria-label={t('iam.a11y.mainTabs')}
        className="flex gap-1 overflow-x-auto pb-1 border-b border-border/60"
      >
        {IAM_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap rounded-t-xl transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[var(--brand)] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t(tab.labelKey)}
            {tab.id === 'team' && kpis && kpis.openInvites > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-amber-500/15 text-amber-700 text-[10px] px-1">
                {kpis.openInvites}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'team' && (
        <div role="tabpanel">
          <TeamTab
            orgId={orgId}
            team={team}
            kpis={kpis}
            loading={loading}
            error={error}
            onSearch={(q) => loadTeam(q)}
            onRefresh={refreshAll}
            onOpenMember={openMember}
          />
        </div>
      )}

      {activeTab === 'roles' && (
        <div role="tabpanel">
          <RolesAccessTab orgId={orgId} roles={roles} loading={loading} />
        </div>
      )}

      {activeTab === 'security' && (
        <div role="tabpanel">
          <SecurityAuditTab security={security} loading={loading} />
        </div>
      )}
    </div>
  );
}
