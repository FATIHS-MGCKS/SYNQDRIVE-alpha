import { Users, Search, Plus, MoreHorizontal, Building2, CheckCircle, XCircle, Clock, X, Save, Trash2, Send, KeyRound, Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlatformUser, UserRole, UserStatus, Organization } from '../data/platform-data';
import { generateId } from '../data/platform-data';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import {
  PageHeader,
  DataCard,
  DataTable,
  MetricCard,
  StatusChip,
  platformRoleTone,
  userAccountStatusTone,
  FormDialog,
  ConfirmDialog,
} from '../../components/patterns';
import type { DataTableColumn } from '../../components/patterns';

interface PlatformUsersViewProps {
  isDarkMode: boolean;
  users: PlatformUser[];
  organizations: Organization[];
  onAddUser: (user: PlatformUser) => void;
  onUpdateUser: (user: PlatformUser) => void;
  onDeleteUser: (id: string) => void;
}

const inputClass =
  'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors bg-muted border-border text-foreground focus:border-ring';

export function PlatformUsersView({ users, organizations, onAddUser, onUpdateUser, onDeleteUser }: PlatformUsersViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<PlatformUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('Org Admin');
  const [formOrgId, setFormOrgId] = useState('');
  const [formStatus, setFormStatus] = useState<UserStatus>('Invited');

  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const openCreate = () => {
    setFormName('');
    setFormEmail('');
    setFormRole('Org Admin');
    setFormOrgId('');
    setFormStatus('Invited');
    setEditUser(null);
    setShowPasswordSection(false);
    setNewPassword('');
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (u: PlatformUser) => {
    setFormName(u.name);
    setFormEmail(u.email);
    setFormRole(u.role);
    setFormOrgId(u.organizationId);
    setFormStatus(u.status);
    setEditUser(u);
    setShowPasswordSection(false);
    setNewPassword('');
    setShowPassword(false);
    setShowModal(true);
  };

  const handleChangePassword = async () => {
    if (!editUser || !newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setPasswordSaving(true);
    try {
      await api.users.changePassword(editUser.id, newPassword);
      toast.success(`Password changed for ${editUser.name}`);
      setNewPassword('');
      setShowPasswordSection(false);
      setShowPassword(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change password');
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSave = () => {
    const orgName = formOrgId === 'platform' ? 'SynqDrive (Platform)' : organizations.find((o) => o.id === formOrgId)?.company_name || '';
    if (editUser) {
      onUpdateUser({
        ...editUser,
        name: formName,
        email: formEmail,
        role: formRole,
        organizationId: formOrgId,
        organizationName: orgName,
        status: formStatus,
      });
    } else {
      const initials = formName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      onAddUser({
        id: generateId('u'),
        name: formName,
        email: formEmail,
        role: formRole,
        organizationId: formOrgId,
        organizationName: orgName,
        status: 'Invited',
        lastActive: 'Never',
        created_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: initials,
        last_login: 'Never',
      });
      toast.success(`Invitation sent to ${formEmail}`);
    }
    setShowModal(false);
    setEditUser(null);
  };

  const filtered = users.filter((u) => {
    const q = searchQuery.toLowerCase();
    return (
      (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.organizationName.toLowerCase().includes(q)) &&
      (filterRole === 'all' || u.role === filterRole) &&
      (filterStatus === 'all' || u.status === filterStatus)
    );
  });

  const activeCount = users.filter((u) => u.status === 'Active').length;
  const invitedCount = users.filter((u) => u.status === 'Invited').length;

  const columns = useMemo<DataTableColumn<PlatformUser>[]>(
    () => [
      {
        key: 'user',
        header: 'User',
        cell: (user) => (
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full sq-tone-brand text-xs font-semibold">
              {user.avatar}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        cell: (user) => (
          <StatusChip tone={platformRoleTone(user.role)} className="text-xs">
            {user.role}
          </StatusChip>
        ),
      },
      {
        key: 'org',
        header: 'Organization',
        cell: (user) => (
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-foreground">{user.organizationName}</span>
          </div>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        cell: (user) => (
          <StatusChip
            tone={userAccountStatusTone(user.status)}
            icon={
              user.status === 'Active' ? (
                <CheckCircle className="h-3 w-3" />
              ) : user.status === 'Invited' ? (
                <Clock className="h-3 w-3" />
              ) : (
                <XCircle className="h-3 w-3" />
              )
            }
            className="text-xs"
          >
            {user.status}
          </StatusChip>
        ),
      },
      {
        key: 'lastActive',
        header: 'Last Active',
        cell: (user) => <span className="text-xs text-muted-foreground">{user.lastActive}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        title="Users"
        description={`${filtered.length} platform users across all organizations`}
        icon={<Users className="h-4 w-4" />}
        actions={
          <button type="button" onClick={openCreate} className="sq-cta flex items-center gap-2 px-4 py-2 text-sm font-semibold">
            <Plus className="h-5 w-5" />
            Invite User
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Total Users" value={users.length} status="neutral" icon={<Users className="h-4 w-4" />} />
        <MetricCard label="Active" value={activeCount} status="success" />
        <MetricCard label="Invited" value={invitedCount} status="info" />
        <MetricCard label="Organizations" value={organizations.length} status="neutral" />
      </div>

      <DataCard flush bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="cursor-pointer appearance-none rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground"
          >
            <option value="all">All Roles</option>
            <option>Master Admin</option>
            <option>Org Admin</option>
            <option>Sub Admin</option>
            <option>Worker</option>
            <option>Driver</option>
            <option>Customer</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="cursor-pointer appearance-none rounded-md border border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground"
          >
            <option value="all">All Status</option>
            <option>Active</option>
            <option>Inactive</option>
            <option>Invited</option>
          </select>
        </div>
      </DataCard>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(u) => u.id}
        empty="No users match your filters"
        rowActions={(user) => (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => openEdit(user)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirm(user.id)}
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-[color:var(--status-critical)]"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        )}
      />

      <FormDialog
        open={showModal}
        onOpenChange={(open) => {
          if (!open) {
            setShowModal(false);
            setEditUser(null);
          }
        }}
        title={editUser ? 'Edit User' : 'Invite User'}
        maxWidthClassName="sm:max-w-lg"
        footer={(
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => {
                setShowModal(false);
                setEditUser(null);
              }}
              className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 font-semibold text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!formName || !formEmail}
              className="sq-cta flex flex-1 items-center justify-center gap-2 px-4 py-2.5 font-semibold disabled:opacity-50"
            >
              {editUser ? (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send Invitation
                </>
              )}
            </button>
          </div>
        )}
      >
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-foreground">Full Name *</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-foreground">Email *</label>
                <input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className={inputClass} type="email" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold text-foreground">Role</label>
                  <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)} className={inputClass}>
                    <option>Master Admin</option>
                    <option>Org Admin</option>
                    <option>Sub Admin</option>
                    <option>Worker</option>
                    <option>Driver</option>
                    <option>Customer</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold text-foreground">Organization</label>
                  <select value={formOrgId} onChange={(e) => setFormOrgId(e.target.value)} className={inputClass}>
                    <option value="platform">SynqDrive (Platform)</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.company_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editUser && (
                <div>
                  <label className="mb-1 block text-sm font-semibold text-foreground">Status</label>
                  <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as UserStatus)} className={inputClass}>
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>Invited</option>
                  </select>
                </div>
              )}
              {editUser && (
                <div className="rounded-lg border border-border bg-muted/50 p-4">
                  {!showPasswordSection ? (
                    <button
                      type="button"
                      onClick={() => setShowPasswordSection(true)}
                      className="flex items-center gap-2 text-sm font-semibold text-[color:var(--brand)] transition-colors hover:opacity-80"
                    >
                      <KeyRound className="h-4 w-4" />
                      Change Password
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-sm font-semibold text-foreground">New Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min. 6 characters"
                          className={`${inputClass} pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleChangePassword}
                          disabled={passwordSaving || newPassword.length < 6}
                          className="sq-cta flex items-center gap-1.5 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          {passwordSaving ? 'Saving...' : 'Update Password'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowPasswordSection(false);
                            setNewPassword('');
                            setShowPassword(false);
                          }}
                          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
      </FormDialog>

      <ConfirmDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
        title="Delete User"
        description="Are you sure you want to remove this user?"
        confirmLabel="Delete"
        tone="critical"
        onConfirm={() => {
          if (deleteConfirm) onDeleteUser(deleteConfirm);
          setDeleteConfirm(null);
        }}
      />
    </div>
  );
}
