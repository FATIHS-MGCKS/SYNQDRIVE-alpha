import { ExternalLink, MailPlus, RefreshCw, Shield } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DataTable,
  EmptyState,
  type DataTableColumn,
  StatusChip,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import { MasterErrorState, MasterLoadingState, MasterPageSection } from '../shell';
import {
  api,
  getErrorMessage,
  type IamTeamListItemDto,
  type OrganizationInviteDto,
  type OrganizationRoleDto,
} from '../../lib/api';
import { isStepUpRequiredError } from '../../lib/mfa';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/LanguageContext';
import { useMasterOrganizationIam } from './useMasterOrganizationIam';
import type { useMasterOrganizationIamMutations } from './useMasterOrganizationIamMutations';

type IamMutations = ReturnType<typeof useMasterOrganizationIamMutations>;

export type MasterOrgIamSecurityNav = {
  section: 'users' | 'roles';
  userId?: string | null;
  roleId?: string | null;
};

type SubTab = 'members' | 'invites' | 'roles';

interface MasterOrganizationIamTabProps {
  orgId: string;
  iamMutations: IamMutations;
  onNavigateSecurityAccess: (nav: MasterOrgIamSecurityNav) => void;
}

function inviteStatusTone(status: OrganizationInviteDto['status']) {
  if (status === 'PENDING') return 'info' as const;
  if (status === 'EXPIRED') return 'warning' as const;
  if (status === 'ACCEPTED') return 'success' as const;
  return 'neutral' as const;
}

export function MasterOrganizationIamTab({
  orgId,
  iamMutations,
  onNavigateSecurityAccess,
}: MasterOrganizationIamTabProps) {
  const { t: tRaw } = useLanguage();
  const t = (key: string, vars?: Record<string, string>) =>
    tRaw(key as TranslationKey, vars);
  const {
    members,
    invites,
    roles,
    loading,
    error,
    search,
    setSearch,
    refresh,
  } = useMasterOrganizationIam(orgId);
  const [subTab, setSubTab] = useState<SubTab>('members');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState<string>('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const defaultRole = useMemo(
    () => roles.find((r) => r.isDefault) ?? roles[0] ?? null,
    [roles],
  );

  const notifyMutationError = (err: unknown, fallbackKey: string) => {
    if (isStepUpRequiredError(err)) return;
    toast.error(t(fallbackKey, { error: getErrorMessage(err) }));
  };

  const memberColumns: DataTableColumn<IamTeamListItemDto>[] = [
    {
      key: 'user',
      header: t('master.organizations.iam.col.user'),
      cell: (row) => (
        <div>
          <p className="text-sm font-semibold">{row.userSummary.displayName}</p>
          <p className="text-xs text-muted-foreground">{row.userSummary.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('master.organizations.iam.col.role'),
      cell: (row) => (
        <StatusChip className="!text-xs">{row.effectiveRoleLabel ?? row.effectiveRole}</StatusChip>
      ),
    },
    {
      key: 'status',
      header: t('master.organizations.iam.col.membership'),
      cell: (row) => (
        <StatusChip className="!text-xs">{row.membershipStatus}</StatusChip>
      ),
    },
    {
      key: 'actions',
      header: t('master.organizations.iam.col.actions'),
      cell: (row) => {
        const userId = row.userSummary.userId;
        if (!userId) return null;
        const suspendKey = `suspend:${userId}`;
        const isBusy = busyKey === suspendKey;
        const suspended =
          row.membershipStatus === 'SUSPENDED' ||
          row.membershipStatus === 'REACTIVATION_REQUIRED';
        const roleMatch = roles.find(
          (r) => r.name === row.effectiveRoleLabel || r.membershipRole === row.effectiveRole,
        );
        return (
          <div className="flex flex-wrap gap-1 justify-end items-center">
            {roles.length > 0 && (
              <Select
                value={roleMatch?.id ?? ''}
                onValueChange={(roleId) => void assignOrganizationRole(userId, roleId)}
                disabled={busyKey === `role:${userId}`}
              >
                <SelectTrigger className="h-8 w-[9rem] text-xs">
                  <SelectValue placeholder={t('master.organizations.iam.inviteRole')} />
                </SelectTrigger>
                <SelectContent>
                  {roles.filter((r) => r.isActive).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onNavigateSecurityAccess({ section: 'users', userId })
              }
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" />
              {t('master.organizations.iam.openGovernance')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => void toggleSuspend(row, suspended)}
            >
              {suspended
                ? t('master.organizations.iam.reactivate')
                : t('master.organizations.iam.suspend')}
            </Button>
          </div>
        );
      },
    },
  ];

  const inviteColumns: DataTableColumn<OrganizationInviteDto>[] = [
    {
      key: 'recipient',
      header: t('master.organizations.iam.col.recipient'),
      cell: (i) => <span className="text-sm">{i.recipientMasked}</span>,
    },
    {
      key: 'status',
      header: t('master.organizations.iam.col.status'),
      cell: (i) => (
        <StatusChip tone={inviteStatusTone(i.status)} className="!text-xs">
          {i.status}
        </StatusChip>
      ),
    },
    {
      key: 'role',
      header: t('master.organizations.iam.col.role'),
      cell: (i) => <span className="text-xs text-muted-foreground">{i.roleSummary}</span>,
    },
    {
      key: 'expires',
      header: t('master.organizations.iam.col.expires'),
      cell: (i) => (
        <span className="text-xs text-muted-foreground">
          {new Date(i.expiresAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('master.organizations.iam.col.actions'),
      cell: (i) => {
        if (i.status !== 'PENDING') return null;
        const key = `invite:${i.inviteId}`;
        return (
          <div className="flex gap-1 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busyKey === key}
              onClick={() => void resendInvite(i)}
            >
              {t('master.organizations.iam.resend')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busyKey === key}
              onClick={() => void revokeInvite(i)}
            >
              {t('master.organizations.iam.revoke')}
            </Button>
          </div>
        );
      },
    },
  ];

  const roleColumns: DataTableColumn<OrganizationRoleDto>[] = [
    { key: 'name', header: t('master.organizations.iam.col.role'), cell: (r) => r.name },
    {
      key: 'membership',
      header: t('master.organizations.iam.col.membershipRole'),
      cell: (r) => <StatusChip className="!text-xs">{r.membershipRole}</StatusChip>,
    },
    {
      key: 'system',
      header: t('master.organizations.iam.col.system'),
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.isSystemTemplate ? t('master.organizations.iam.systemRole') : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('master.organizations.iam.col.actions'),
      cell: (r) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onNavigateSecurityAccess({ section: 'roles', roleId: r.id })}
        >
          <Shield className="h-3.5 w-3.5 mr-1" />
          {t('master.organizations.iam.manageRole')}
        </Button>
      ),
    },
  ];

  async function assignOrganizationRole(userId: string, roleId: string) {
    const key = `role:${userId}`;
    setBusyKey(key);
    try {
      await iamMutations.runWithStepUp(
        async () => {
          await api.users.assignRole(orgId, userId, roleId);
        },
        {
          onSuccess: async () => {
            toast.success(t('master.organizations.iam.roleAssignSuccess'));
            await refresh();
          },
        },
      );
    } catch (e) {
      notifyMutationError(e, 'master.organizations.iam.mutationFailed');
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleSuspend(row: IamTeamListItemDto, suspended: boolean) {
    const userId = row.userSummary.userId;
    if (!userId) return;
    const key = `suspend:${userId}`;
    setBusyKey(key);
    try {
      await iamMutations.runWithStepUp(
        async () => {
          await api.users.updateByOrg(orgId, userId, {
            status: (suspended ? 'ACTIVE' : 'SUSPENDED') as 'ACTIVE' | 'SUSPENDED',
          });
        },
        {
          onSuccess: async () => {
            toast.success(
              suspended
                ? t('master.organizations.iam.reactivateSuccess')
                : t('master.organizations.iam.suspendSuccess'),
            );
            await refresh();
          },
        },
      );
    } catch (e) {
      notifyMutationError(e, 'master.organizations.iam.mutationFailed');
    } finally {
      setBusyKey(null);
    }
  }

  async function resendInvite(invite: OrganizationInviteDto) {
    const key = `invite:${invite.inviteId}`;
    setBusyKey(key);
    try {
      await iamMutations.runWithStepUp(
        async () => {
          await api.organizationInvites.resend(orgId, invite.inviteId);
        },
        {
          onSuccess: async () => {
            toast.success(t('master.organizations.iam.resendSuccess'));
            await refresh();
          },
        },
      );
    } catch (e) {
      notifyMutationError(e, 'master.organizations.iam.mutationFailed');
    } finally {
      setBusyKey(null);
    }
  }

  async function revokeInvite(invite: OrganizationInviteDto) {
    if (!window.confirm(t('master.organizations.iam.revokeConfirm', { recipient: invite.recipientMasked }))) {
      return;
    }
    const key = `invite:${invite.inviteId}`;
    setBusyKey(key);
    try {
      await iamMutations.runWithStepUp(
        async () => {
          await api.organizationInvites.revoke(orgId, invite.inviteId);
        },
        {
          onSuccess: async () => {
            toast.success(t('master.organizations.iam.revokeSuccess'));
            await refresh();
          },
        },
      );
    } catch (e) {
      notifyMutationError(e, 'master.organizations.iam.mutationFailed');
    } finally {
      setBusyKey(null);
    }
  }

  async function submitInvite() {
    const email = inviteEmail.trim();
    if (!email) {
      toast.error(t('master.organizations.iam.inviteEmailRequired'));
      return;
    }
    const role = roles.find((r) => r.id === inviteRoleId) ?? defaultRole;
    setBusyKey('invite-create');
    try {
      await iamMutations.runWithStepUp(
        async () => {
          await api.organizationInvites.create(orgId, {
            email,
            organizationRoleId: role?.id,
            membershipRole: role?.membershipRole,
          });
        },
        {
          onSuccess: async () => {
            toast.success(t('master.organizations.iam.inviteSuccess'));
            setInviteEmail('');
            setInviteOpen(false);
            await refresh();
          },
        },
      );
    } catch (e) {
      notifyMutationError(e, 'master.organizations.iam.mutationFailed');
    } finally {
      setBusyKey(null);
    }
  }

  const subTabBtn = (id: SubTab, label: string) => (
    <Button
      type="button"
      variant={subTab === id ? 'default' : 'ghost'}
      size="sm"
      onClick={() => setSubTab(id)}
    >
      {label}
    </Button>
  );

  return (
    <MasterPageSection
      title={t('master.organizations.iam.title')}
      description={t('master.organizations.iam.description')}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            {t('master.organizations.iam.refresh')}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setInviteRoleId(defaultRole?.id ?? '');
              setInviteOpen((v) => !v);
            }}
          >
            <MailPlus className="h-3.5 w-3.5 mr-1" />
            {t('master.organizations.iam.invite')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() =>
              onNavigateSecurityAccess({ section: 'users', userId: null })
            }
          >
            {t('master.organizations.iam.openSecurityHub')}
          </Button>
        </div>
      )}
    >
      {error && <MasterErrorState title={t('master.organizations.iam.title')} error={error} onRetry={() => void refresh()} />}

      <div className="flex flex-wrap gap-2 mb-4">
        {subTabBtn('members', t('master.organizations.iam.tab.members'))}
        {subTabBtn('invites', t('master.organizations.iam.tab.invites'))}
        {subTabBtn('roles', t('master.organizations.iam.tab.roles'))}
      </div>

      {inviteOpen && (
        <div className="rounded-lg border border-border p-4 mb-4 space-y-3">
          <p className="text-sm font-medium">{t('master.organizations.iam.inviteFormTitle')}</p>
          <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
            <div className="space-y-1">
              <Label htmlFor="master-org-invite-email">{t('master.organizations.iam.inviteEmail')}</Label>
              <Input
                id="master-org-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('master.organizations.iam.inviteRole')}</Label>
              <Select value={inviteRoleId || defaultRole?.id || ''} onValueChange={setInviteRoleId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('master.organizations.iam.inviteRole')} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busyKey === 'invite-create'} onClick={() => void submitInvite()}>
              {t('master.organizations.iam.sendInvite')}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>
              {t('master.organizations.iam.cancel')}
            </Button>
          </div>
        </div>
      )}

      {subTab === 'members' && (
        <>
          <MotionSearchRow search={search} setSearch={setSearch} t={t} />
          {loading && <MasterLoadingState variant="table" />}
          {!loading && !error && (
            <DataTable
              columns={memberColumns}
              rows={members}
              getRowKey={(row) => row.membershipId ?? row.userSummary.email}
              dense
              empty={<EmptyState title={t('master.organizations.iam.emptyMembers')} />}
            />
          )}
        </>
      )}

      {subTab === 'invites' && (
        <>
          {loading && <MasterLoadingState variant="table" />}
          {!loading && !error && (
            <DataTable
              columns={inviteColumns}
              rows={invites}
              getRowKey={(i) => i.inviteId}
              dense
              empty={<EmptyState title={t('master.organizations.iam.emptyInvites')} />}
            />
          )}
        </>
      )}

      {subTab === 'roles' && (
        <>
          {loading && <MasterLoadingState variant="rows" count={4} />}
          {!loading && !error && (
            <DataTable
              columns={roleColumns}
              rows={roles}
              getRowKey={(r) => r.id}
              dense
              empty={<EmptyState title={t('master.organizations.iam.emptyRoles')} />}
            />
          )}
        </>
      )}
    </MasterPageSection>
  );
}

function MotionSearchRow({
  search,
  setSearch,
  t,
}: {
  search: string;
  setSearch: (v: string) => void;
  t: (key: string, vars?: Record<string, string>) => string;
}) {
  return (
    <div className="mb-3 max-w-sm">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('master.organizations.iam.searchMembers')}
        aria-label={t('master.organizations.iam.searchMembers')}
      />
    </div>
  );
}