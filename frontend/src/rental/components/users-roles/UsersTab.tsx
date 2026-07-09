import {
  Key,
  Mail,
  MapPin,
  MoreHorizontal,
  Pencil,
  Search,
  Shield,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  DataTable,
  EmptyState,
  ErrorState,
  MetricCard,
  SkeletonMetricGrid,
  SkeletonRows,
  type DataTableColumn,
} from '../../../components/patterns';
import { api, type OrganizationInviteDto, type OrgUserDto, type Station } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { AdminBadge, ScopeBadge, UserStatusBadge } from './badges';
import { CreateUserWizard } from './CreateUserWizard';
import { UserDetailDrawer } from './UserDetailDrawer';
import type { AccessTypeFilter, UserStatusFilter } from './types';
import {
  formatDateTime,
  getInitials,
  isLastOrgAdminError,
  isOrgAdmin,
  isScopedUser,
  userDisplayRole,
  userStationLabel,
} from './utils';

interface UsersTabProps {
  orgId: string;
  users: OrgUserDto[];
  invites: OrganizationInviteDto[];
  stations: Station[];
  stationNameById: Map<string, string>;
  kpis: {
    total: number;
    active: number;
    pendingInvites: number;
    admins: number;
    scoped: number;
  };
  loading: boolean;
  error: string | null;
  rolesLoading: boolean;
  focusUserId?: string | null;
  onFocusUserHandled?: () => void;
  onRefresh: () => Promise<void>;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (err: unknown, fallback: string) => void;
}

export function UsersTab({
  orgId,
  users,
  invites,
  stations,
  stationNameById,
  kpis,
  loading,
  error,
  focusUserId,
  onFocusUserHandled,
  onRefresh,
  onNotifySuccess,
  onNotifyError,
}: UsersTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [stationFilter, setStationFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState<AccessTypeFilter>('all');

  const [selectedUser, setSelectedUser] = useState<OrgUserDto | null>(null);
  const [drawerEditMode, setDrawerEditMode] = useState(false);
  const [drawerFocusSection, setDrawerFocusSection] = useState<
    'role' | 'scope' | 'permissions' | undefined
  >();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OrgUserDto | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<OrgUserDto | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [lastAdminError, setLastAdminError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<OrgUserDto | null>(null);

  const { hasPermission } = useRentalOrg();
  const canWriteUsers = hasPermission('users-roles', 'write');
  const canManageUsers = hasPermission('users-roles', 'manage');

  const openDrawer = (
    user: OrgUserDto,
    opts?: { edit?: boolean; section?: 'role' | 'scope' | 'permissions' },
  ) => {
    setSelectedUser(user);
    setDrawerEditMode(!!opts?.edit);
    setDrawerFocusSection(opts?.section);
  };

  useEffect(() => {
    if (!rowMenu) return;
    const close = () => setRowMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [rowMenu]);

  const pendingInviteByEmail = useMemo(() => {
    const map = new Map<string, OrganizationInviteDto>();
    for (const inv of invites) {
      if (inv.status === 'PENDING') {
        map.set(inv.email.toLowerCase(), inv);
      }
    }
    return map;
  }, [invites]);

  useEffect(() => {
    if (!focusUserId) return;
    const match = users.find((u) => u.id === focusUserId);
    if (match) setSelectedUser(match);
    onFocusUserHandled?.();
  }, [focusUserId, users, onFocusUserHandled]);

  const roleOptions = useMemo(() => {
    const set = new Set(users.map((u) => userDisplayRole(u)));
    return ['all', ...Array.from(set).sort()];
  }, [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${u.name} ${u.email} ${userDisplayRole(u)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === 'active' && u.status !== 'Active') return false;
      if (statusFilter === 'invited' && u.status !== 'Invited') return false;
      if (statusFilter === 'inactive' && u.status !== 'Inactive' && u.status !== 'Suspended')
        return false;
      if (roleFilter !== 'all' && userDisplayRole(u) !== roleFilter) return false;
      if (stationFilter !== 'all') {
        const label = userStationLabel(u, stationNameById);
        if (!label.toLowerCase().includes(stationFilter.toLowerCase())) return false;
      }
      if (accessFilter === 'all-stations' && isScopedUser(u)) return false;
      if (accessFilter === 'scoped' && !isScopedUser(u)) return false;
      if (accessFilter === 'field-agent' && !u.fieldAgentAccess) return false;
      return true;
    });
  }, [users, search, statusFilter, roleFilter, stationFilter, accessFilter, stationNameById]);

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setActionLoading(true);
    setLastAdminError(null);
    try {
      await api.users.updateByOrg(orgId, deactivateTarget.id, { status: 'SUSPENDED' });
      onNotifySuccess('Benutzer wurde deaktiviert');
      setDeactivateTarget(null);
      setSelectedUser(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (isLastOrgAdminError(msg)) {
        setLastAdminError(
          'Mindestens ein aktiver Organisationsadministrator ist erforderlich.',
        );
      }
      onNotifyError(err, 'Benutzer konnte nicht deaktiviert werden.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReactivate = async (user: OrgUserDto) => {
    setActionLoading(true);
    try {
      await api.users.updateByOrg(orgId, user.id, { status: 'ACTIVE' });
      onNotifySuccess('Benutzer wurde reaktiviert');
      await onRefresh();
    } catch (err) {
      onNotifyError(err, 'Benutzer konnte nicht reaktiviert werden.');
    } finally {
      setActionLoading(false);
      setRowMenu(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    setLastAdminError(null);
    try {
      await api.users.deleteByOrg(orgId, deleteTarget.id);
      onNotifySuccess('Benutzer aus der Organisation entfernt');
      setDeleteTarget(null);
      setSelectedUser(null);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (isLastOrgAdminError(msg)) {
        setLastAdminError(
          'Mindestens ein aktiver Organisationsadministrator ist erforderlich. Bitte weisen Sie zuerst einem anderen Benutzer die Org-Admin-Rolle zu.',
        );
      }
      onNotifyError(err, 'Benutzer konnte nicht entfernt werden.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendInvite = async (user: OrgUserDto) => {
    const invite = pendingInviteByEmail.get(user.email.toLowerCase());
    if (!invite) {
      onNotifyError(new Error('Keine offene Einladung gefunden'), 'Einladung konnte nicht erneut gesendet werden.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await api.organizationInvites.resend(orgId, invite.id);
      if (res.inviteUrl) {
        await navigator.clipboard.writeText(res.inviteUrl);
        onNotifySuccess('Einladung erneut gesendet — Link kopiert');
      } else {
        onNotifySuccess('Einladung erneut gesendet');
      }
      await onRefresh();
    } catch (err) {
      onNotifyError(err, 'Einladung konnte nicht erneut gesendet werden.');
    } finally {
      setActionLoading(false);
      setRowMenu(null);
    }
  };

  const handlePasswordReset = async () => {
    if (!passwordTarget || newPassword.length < 12) return;
    setActionLoading(true);
    try {
      await api.users.changePasswordByOrg(orgId, passwordTarget.id, newPassword);
      onNotifySuccess('Passwort wurde zurückgesetzt');
      setPasswordTarget(null);
      setNewPassword('');
    } catch (err) {
      onNotifyError(err, 'Passwort konnte nicht zurückgesetzt werden.');
    } finally {
      setActionLoading(false);
    }
  };

  const columns: DataTableColumn<OrgUserDto>[] = [
    {
      key: 'user',
      header: 'Benutzer',
      cell: (u) => (
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-foreground shrink-0">
            {u.avatar || getInitials(u.name, u.email)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground truncate">{u.name || u.email}</p>
            <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rolle',
      cell: (u) => (
        <div className="space-y-1">
          <p className="text-[12.5px] font-medium text-foreground">{userDisplayRole(u)}</p>
          <div className="flex flex-wrap gap-1">
            <AdminBadge user={u} />
            <ScopeBadge user={u} />
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (u) => <UserStatusBadge status={u.status} />,
      className: 'hidden md:table-cell',
    },
    {
      key: 'scope',
      header: 'Standort',
      cell: (u) => (
        <span className="text-[12px] text-muted-foreground">
          {userStationLabel(u, stationNameById)}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'login',
      header: 'Letzter Login',
      cell: (u) => (
        <span className="text-[12px] text-muted-foreground tabular-nums">
          {formatDateTime(u.lastLoginAt || u.lastActive)}
        </span>
      ),
      className: 'hidden xl:table-cell',
    },
    {
      key: 'security',
      header: 'Sicherheit',
      cell: (u) => (
        <span className="text-[11px] text-muted-foreground">
          {u.mustChangePassword ? 'Passwort ändern' : '—'}
        </span>
      ),
      className: 'hidden xl:table-cell',
    },
    {
      key: 'actions',
      header: '',
      cell: (u) => (
        <div className="relative flex justify-end">
          {canWriteUsers || canManageUsers ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setRowMenu(rowMenu === u.id ? null : u.id);
                }}
                className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"
                aria-label="Aktionen"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {rowMenu === u.id && (
                <div
                  className="absolute right-0 top-9 z-20 min-w-[180px] rounded-xl border border-border bg-card shadow-[var(--shadow-2)] py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {canWriteUsers && (
                    <>
                      <MenuBtn icon={Pencil} label="Bearbeiten" onClick={() => { openDrawer(u, { edit: true }); setRowMenu(null); }} />
                      <MenuBtn icon={Shield} label="Rolle ändern" onClick={() => { openDrawer(u, { edit: true, section: 'role' }); setRowMenu(null); }} />
                      <MenuBtn icon={MapPin} label="Zugriff ändern" onClick={() => { openDrawer(u, { edit: true, section: 'scope' }); setRowMenu(null); }} />
                    </>
                  )}
                  {canManageUsers && u.status === 'Invited' && pendingInviteByEmail.has(u.email.toLowerCase()) && (
                    <MenuBtn icon={Mail} label="Einladung erneut senden" onClick={() => void handleResendInvite(u)} />
                  )}
                  {canManageUsers && u.status === 'Active' && (
                    <MenuBtn icon={UserMinus} label="Deaktivieren" onClick={() => { setDeactivateTarget(u); setRowMenu(null); }} />
                  )}
                  {canManageUsers && (u.status === 'Inactive' || u.status === 'Suspended') && (
                    <MenuBtn icon={Users} label="Reaktivieren" onClick={() => void handleReactivate(u)} />
                  )}
                  {canManageUsers && (
                    <MenuBtn icon={Key} label="Passwort zurücksetzen" onClick={() => { setPasswordTarget(u); setRowMenu(null); }} />
                  )}
                  {canManageUsers && (
                    <MenuBtn icon={Trash2} label="Entfernen" danger onClick={() => { setDeleteTarget(u); setRowMenu(null); }} />
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      ),
    },
  ];

  if (error && !users.length) {
    return <ErrorState title="Benutzer konnten nicht geladen werden" error={error} onRetry={() => void onRefresh()} retryLabel="Erneut laden" />;
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <SkeletonMetricGrid count={5} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <MetricCard label="Benutzer gesamt" value={kpis.total} icon={<Users className="w-4 h-4" />} />
          <MetricCard label="Aktive Benutzer" value={kpis.active} status="success" icon={<Users className="w-4 h-4" />} />
          <MetricCard label="Ausstehende Einladungen" value={kpis.pendingInvites} status="warning" icon={<Mail className="w-4 h-4" />} />
          <MetricCard label="Organisations-Admins" value={kpis.admins} status="info" icon={<Shield className="w-4 h-4" />} />
          <MetricCard label="Eingeschränkter Standortzugriff" value={kpis.scoped} status="info" icon={<Users className="w-4 h-4" />} />
        </div>
      )}

      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)] space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Suche nach Name, E-Mail oder Rolle…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border/70 bg-card text-[13px] outline-none focus:ring-2 focus:ring-[var(--brand-soft)]"
            />
          </div>
          <button
            type="button"
            className="sq-3d-btn sq-3d-btn--primary text-xs flex items-center gap-2 shrink-0"
            onClick={() => setWizardOpen(true)}
            disabled={!canWriteUsers}
            title={!canWriteUsers ? 'Keine Berechtigung zum Anlegen von Benutzern' : undefined}
          >
            <UserPlus className="w-4 h-4" /> Benutzer einladen
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
          <FilterSelect label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as UserStatusFilter)} options={[
            { value: 'all', label: 'Alle Status' },
            { value: 'active', label: 'Aktiv' },
            { value: 'invited', label: 'Eingeladen' },
            { value: 'inactive', label: 'Deaktiviert' },
          ]} />
          <FilterSelect label="Rolle" value={roleFilter} onChange={setRoleFilter} options={roleOptions.map((r) => ({ value: r, label: r === 'all' ? 'Alle Rollen' : r }))} />
          <FilterSelect label="Station" value={stationFilter} onChange={setStationFilter} options={[
            { value: 'all', label: 'Alle Stationen' },
            ...stations.map((s) => ({ value: s.name, label: s.name })),
          ]} />
          <FilterSelect label="Zugriffstyp" value={accessFilter} onChange={(v) => setAccessFilter(v as AccessTypeFilter)} options={[
            { value: 'all', label: 'Alle Zugriffe' },
            { value: 'all-stations', label: 'Alle Stationen' },
            { value: 'scoped', label: 'Eingeschränkt' },
            { value: 'field-agent', label: 'Field Agent' },
          ]} />
        </div>
      </div>

      <div className="sq-card rounded-2xl shadow-[var(--shadow-1)] overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            title="Keine Benutzer gefunden"
            description={search ? 'Passen Sie die Filter an oder erstellen Sie einen neuen Benutzer.' : 'Laden Sie den ersten Benutzer per Einladung ein.'}
            action={
              <button type="button" className="sq-3d-btn sq-3d-btn--primary text-xs" onClick={() => setWizardOpen(true)}>
                Benutzer einladen
              </button>
            }
          />
        ) : (
          <>
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                rows={filtered}
                getRowKey={(u) => u.id}
                onRowClick={(u) => openDrawer(u)}
                card={false}
              />
            </div>
            <div className="md:hidden divide-y divide-border/60">
              {filtered.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openDrawer(u)}
                  className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                      {getInitials(u.name, u.email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] truncate">{u.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <UserStatusBadge status={u.status} />
                        <span className="text-[11px] text-muted-foreground">{userDisplayRole(u)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {wizardOpen && (
        <CreateUserWizard
          orgId={orgId}
          stations={stations}
          onClose={() => setWizardOpen(false)}
          onDone={async () => {
            setWizardOpen(false);
            await onRefresh();
            onNotifySuccess('Einladung bzw. Benutzer wurde erstellt');
          }}
          onError={(err) => onNotifyError(err, 'Aktion fehlgeschlagen')}
        />
      )}

      {selectedUser && (
        <UserDetailDrawer
          orgId={orgId}
          user={selectedUser}
          stations={stations}
          stationNameById={stationNameById}
          open={!!selectedUser}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedUser(null);
              setDrawerEditMode(false);
              setDrawerFocusSection(undefined);
            }
          }}
          initialEditMode={drawerEditMode}
          focusSection={drawerFocusSection}
          onUpdated={async () => {
            await onRefresh();
            onNotifySuccess('Änderungen gespeichert');
          }}
          onError={(err) => onNotifyError(err, 'Speichern fehlgeschlagen')}
          onRemove={() => setDeleteTarget(selectedUser)}
          onPasswordReset={() => setPasswordTarget(selectedUser)}
          canWrite={canWriteUsers}
          canManage={canManageUsers}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title="Benutzer deaktivieren?"
          description={`${deactivateTarget.name || deactivateTarget.email} kann sich danach nicht mehr anmelden, bleibt aber in der Organisation.`}
          confirmLabel="Deaktivieren"
          danger
          loading={actionLoading}
          onCancel={() => setDeactivateTarget(null)}
          onConfirm={() => void handleDeactivate()}
        />
      )}

      {lastAdminError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-800 dark:text-red-200">
          {lastAdminError}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title={isOrgAdmin(deleteTarget) ? 'Org Admin entfernen?' : 'Benutzer entfernen?'}
          description={
            isOrgAdmin(deleteTarget)
              ? 'Achtung: Dieser Benutzer ist Org Admin. Er kann nicht entfernt werden, wenn er der letzte aktive Admin ist.'
              : `${deleteTarget.name || deleteTarget.email} wird aus der Organisation entfernt.`
          }
          confirmLabel="Entfernen"
          danger
          loading={actionLoading}
          onCancel={() => { setDeleteTarget(null); setLastAdminError(null); }}
          onConfirm={() => void handleDelete()}
        />
      )}

      {passwordTarget && (
        <ConfirmDialog
          title="Passwort zurücksetzen"
          description={`Neues Passwort für ${passwordTarget.name || passwordTarget.email} (min. 12 Zeichen). Der Benutzer muss es beim nächsten Login ändern.`}
          confirmLabel="Passwort setzen"
          loading={actionLoading}
          onCancel={() => { setPasswordTarget(null); setNewPassword(''); }}
          onConfirm={() => void handlePasswordReset()}
        >
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Neues Passwort"
            className="w-full mt-3 px-3 py-2.5 rounded-xl border border-border/70 bg-card text-[13px]"
          />
        </ConfirmDialog>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border border-border/70 bg-card text-[12px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function MenuBtn({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-muted/50 ${danger ? 'text-red-600' : 'text-foreground'}`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  loading,
  onCancel,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] overlay-scrim flex items-center justify-center p-4" onClick={onCancel}>
      <div className="sq-card max-w-md w-full p-5 rounded-2xl shadow-[var(--shadow-2)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
        <p className="text-[13px] text-muted-foreground mt-2">{description}</p>
        {children}
        <div className="flex gap-2 mt-5 justify-end">
          <button type="button" className="sq-3d-btn text-xs" onClick={onCancel} disabled={loading}>Abbrechen</button>
          <button
            type="button"
            className={`sq-3d-btn text-xs ${danger ? 'bg-red-600 text-white hover:bg-red-700' : 'sq-3d-btn--primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
