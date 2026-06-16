import { useState } from 'react';
import { PageHeader } from '../../../components/patterns';
import { ACCESS_CONTROL_TABS } from './constants';
import { useAccessControlCenter } from './useAccessControlCenter';
import { UsersTab } from './UsersTab';
import { InvitesTab } from './InvitesTab';
import { RolesTab } from './RolesTab';
import { AccessScopesTab } from './AccessScopesTab';
import { SecurityActivityTab } from './SecurityActivityTab';
import type { AccessControlTab, UsersRolesTabProps } from './types';

export function UsersRolesTab({ orgId }: UsersRolesTabProps) {
  const [activeTab, setActiveTab] = useState<AccessControlTab>('users');
  const [focusUserId, setFocusUserId] = useState<string | null>(null);

  const {
    users,
    invites,
    roles,
    stations,
    stationNameById,
    kpis,
    usersLoading,
    rolesLoading,
    usersError,
    rolesError,
    loadUsers,
    loadRoles,
    refreshAll,
    notifySuccess,
    notifyError,
  } = useAccessControlCenter(orgId);

  if (!orgId?.trim()) {
    return (
      <div className="max-w-[1600px] mx-auto py-12 text-center text-[13px] text-muted-foreground">
        Keine Organisation geladen.
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-fade-up">
      <PageHeader
        title="Benutzer & Rollen"
        description="Verwalten Sie Benutzer, Einladungen, Rollenvorlagen und Zugriffsbereiche Ihrer Organisation."
      />

      <div className="flex gap-1 overflow-x-auto pb-1 border-b border-border/60">
        {ACCESS_CONTROL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-[13px] font-semibold whitespace-nowrap rounded-t-xl transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[var(--brand)] text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {tab.id === 'invites' && kpis.pendingInvites > 0 && (
              <span className="ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-amber-500/15 text-amber-700 text-[10px] px-1">
                {kpis.pendingInvites}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'users' && (
        <UsersTab
          orgId={orgId}
          users={users}
          invites={invites}
          stations={stations}
          stationNameById={stationNameById}
          kpis={{ ...kpis, pendingInvites: invites.filter((i) => i.status === 'PENDING').length }}
          loading={usersLoading}
          error={usersError}
          rolesLoading={rolesLoading}
          focusUserId={focusUserId}
          onFocusUserHandled={() => setFocusUserId(null)}
          onRefresh={refreshAll}
          onNotifySuccess={notifySuccess}
          onNotifyError={notifyError}
        />
      )}

      {activeTab === 'invites' && (
        <InvitesTab
          orgId={orgId}
          onRefreshParent={refreshAll}
          onNotifySuccess={notifySuccess}
          onNotifyError={notifyError}
        />
      )}

      {activeTab === 'roles' && (
        <RolesTab
          orgId={orgId}
          roles={roles}
          stations={stations}
          loading={rolesLoading}
          error={rolesError}
          onRefresh={loadRoles}
          onNotifySuccess={notifySuccess}
          onNotifyError={notifyError}
        />
      )}

      {activeTab === 'scopes' && (
        <AccessScopesTab
          users={users}
          stations={stations}
          stationNameById={stationNameById}
          loading={usersLoading}
          error={usersError}
          onRetry={() => void loadUsers()}
          onSelectUser={(u) => {
            setFocusUserId(u.id);
            setActiveTab('users');
          }}
        />
      )}

      {activeTab === 'security' && <SecurityActivityTab orgId={orgId} />}
    </div>
  );
}
