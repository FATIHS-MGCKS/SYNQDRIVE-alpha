import { Users, Search, Plus, MoreHorizontal, Shield, UserCog, Eye, EyeOff, Building2, CheckCircle, XCircle, Clock, X, Save, Trash2, Send, KeyRound } from 'lucide-react';
import { useState } from 'react';
import type { PlatformUser, UserRole, UserStatus, Organization } from '../data/platform-data';
import { generateId } from '../data/platform-data';
import { toast } from 'sonner';
import { api } from '../../lib/api';

interface PlatformUsersViewProps {
  isDarkMode: boolean;
  users: PlatformUser[];
  organizations: Organization[];
  onAddUser: (user: PlatformUser) => void;
  onUpdateUser: (user: PlatformUser) => void;
  onDeleteUser: (id: string) => void;
}

const roleColors: Record<string, string> = { 'Master Admin': 'bg-red-50 text-red-700 border-red-200', 'Org Admin': 'bg-purple-50 text-purple-700 border-purple-200', 'Sub Admin': 'bg-blue-50 text-blue-700 border-blue-200', 'Worker': 'bg-amber-50 text-amber-700 border-amber-200', 'Driver': 'bg-indigo-50 text-indigo-700 border-indigo-200', 'Customer': 'bg-gray-100 text-gray-600 border-gray-200' };

export function PlatformUsersView({ isDarkMode, users, organizations, onAddUser, onUpdateUser, onDeleteUser }: PlatformUsersViewProps) {
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

  const openCreate = () => { setFormName(''); setFormEmail(''); setFormRole('Org Admin'); setFormOrgId(''); setFormStatus('Invited'); setEditUser(null); setShowPasswordSection(false); setNewPassword(''); setShowPassword(false); setShowModal(true); };
  const openEdit = (u: PlatformUser) => { setFormName(u.name); setFormEmail(u.email); setFormRole(u.role); setFormOrgId(u.organizationId); setFormStatus(u.status); setEditUser(u); setShowPasswordSection(false); setNewPassword(''); setShowPassword(false); setShowModal(true); };

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
    const orgName = formOrgId === 'platform' ? 'SynqDrive (Platform)' : organizations.find(o => o.id === formOrgId)?.company_name || '';
    if (editUser) {
      onUpdateUser({ ...editUser, name: formName, email: formEmail, role: formRole, organizationId: formOrgId, organizationName: orgName, status: formStatus });
    } else {
      const initials = formName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      onAddUser({
        id: generateId('u'), name: formName, email: formEmail, role: formRole, organizationId: formOrgId, organizationName: orgName,
        status: 'Invited', lastActive: 'Never', created_at: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        avatar: initials, last_login: 'Never',
      });
      toast.success(`Invitation sent to ${formEmail}`);
    }
    setShowModal(false); setEditUser(null);
  };

  const filtered = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.organizationName.toLowerCase().includes(q))
      && (filterRole === 'all' || u.role === filterRole) && (filterStatus === 'all' || u.status === filterStatus);
  });

  const cardClass = 'bg-card border border-border rounded-lg shadow-xs';
  const inputClass = 'w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors bg-muted border-border text-foreground focus:border-ring';

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Users</h1>
          <p className="text-sm mt-1 font-medium text-muted-foreground">{filtered.length} platform users across all organizations</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg text-sm font-semibold shadow-sm hover:shadow-md transition-all">
          <Plus className="w-5 h-5" />Invite User
        </button>
      </div>

      <div className={`${cardClass} p-4`}>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-md border bg-muted border-border">
            <Search className={`w-4 h-4 shrink-0 text-muted-foreground`} />
            <input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={`flex-1 bg-transparent outline-none text-sm font-medium text-foreground placeholder:text-muted-foreground`} />
          </div>
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className={`px-3 py-2 rounded-md border text-xs font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}><option value="all">All Roles</option><option>Master Admin</option><option>Org Admin</option><option>Sub Admin</option><option>Worker</option><option>Driver</option><option>Customer</option></select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`px-3 py-2 rounded-md border text-xs font-semibold appearance-none cursor-pointer bg-muted border-border text-foreground`}><option value="all">All Status</option><option>Active</option><option>Inactive</option><option>Invited</option></select>
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className={`border-b border-border bg-muted/50`}>
              <th className={`text-left px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>User</th>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Role</th>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Organization</th>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Status</th>
              <th className={`text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground`}>Last Active</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-muted/50">
                  <td className="px-5 py-2"><div className="flex items-center gap-2.5"><div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0">{user.avatar}</div><div><p className={`text-sm font-semibold text-foreground`}>{user.name}</p><p className={`text-xs text-muted-foreground`}>{user.email}</p></div></div></td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${roleColors[user.role]}`}>{user.role}</span></td>
                  <td className="px-3 py-2"><div className="flex items-center gap-2"><Building2 className={`w-3.5 h-3.5 text-muted-foreground`} /><span className={`text-xs text-foreground`}>{user.organizationName}</span></div></td>
                  <td className="px-3 py-2"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${user.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : user.status === 'Invited' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>{user.status === 'Active' ? <CheckCircle className="w-3 h-3" /> : user.status === 'Invited' ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{user.status}</span></td>
                  <td className={`px-3 py-2 text-xs text-muted-foreground`}>{user.lastActive}</td>
                  <td className="px-3 py-2"><div className="flex gap-1"><button onClick={() => openEdit(user)} className="p-1.5 rounded-lg transition-colors hover:bg-muted text-muted-foreground"><MoreHorizontal className="w-4 h-4" /></button><button onClick={() => setDeleteConfirm(user.id)} className="p-1.5 rounded-lg transition-colors hover:bg-red-50 text-muted-foreground hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400"><Trash2 className="w-4 h-4" /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100]">
          <div className={`max-w-lg w-full mx-4 bg-card border border-border rounded-xl p-5 shadow-lg`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-semibold text-foreground">{editUser ? 'Edit User' : 'Invite User'}</h2>
              <button onClick={() => { setShowModal(false); setEditUser(null); }} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div><label className={`block text-sm font-semibold mb-1 text-foreground`}>Full Name *</label><input value={formName} onChange={e => setFormName(e.target.value)} className={inputClass} /></div>
              <div><label className={`block text-sm font-semibold mb-1 text-foreground`}>Email *</label><input value={formEmail} onChange={e => setFormEmail(e.target.value)} className={inputClass} type="email" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={`block text-sm font-semibold mb-1 text-foreground`}>Role</label><select value={formRole} onChange={e => setFormRole(e.target.value as UserRole)} className={inputClass}><option>Master Admin</option><option>Org Admin</option><option>Sub Admin</option><option>Worker</option><option>Driver</option><option>Customer</option></select></div>
                <div><label className={`block text-sm font-semibold mb-1 text-foreground`}>Organization</label><select value={formOrgId} onChange={e => setFormOrgId(e.target.value)} className={inputClass}><option value="platform">SynqDrive (Platform)</option>{organizations.map(o => <option key={o.id} value={o.id}>{o.company_name}</option>)}</select></div>
              </div>
              {editUser && (
                <div><label className={`block text-sm font-semibold mb-1 text-foreground`}>Status</label><select value={formStatus} onChange={e => setFormStatus(e.target.value as UserStatus)} className={inputClass}><option>Active</option><option>Inactive</option><option>Invited</option></select></div>
              )}
              {editUser && (
                <div className="rounded-lg border border-border p-4 bg-muted/50">
                  {!showPasswordSection ? (
                    <button onClick={() => setShowPasswordSection(true)} className="flex items-center gap-2 text-sm font-semibold transition-colors text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300">
                      <KeyRound className="w-4 h-4" />Change Password
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <label className={`block text-sm font-semibold text-foreground`}>New Password</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Min. 6 characters"
                          className={`${inputClass} pr-10`}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleChangePassword} disabled={passwordSaving || newPassword.length < 6} className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-md ${passwordSaving || newPassword.length < 6 ? 'opacity-50' : 'hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'} transition-all`}>
                          <KeyRound className="w-3.5 h-3.5" />{passwordSaving ? 'Saving...' : 'Update Password'}
                        </button>
                        <button onClick={() => { setShowPasswordSection(false); setNewPassword(''); setShowPassword(false); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => { setShowModal(false); setEditUser(null); }} className={`flex-1 px-4 py-2.5 rounded-lg font-semibold bg-muted text-foreground border border-border`}>Cancel</button>
              <button onClick={handleSave} disabled={!formName || !formEmail} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold shadow-lg ${(!formName || !formEmail) ? 'opacity-50' : 'hover:shadow-xl'}`}>{editUser ? <><Save className="w-4 h-4" />Save</> : <><Send className="w-4 h-4" />Send Invitation</>}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[100]">
          <div className={`max-w-md w-full mx-4 bg-card border border-border rounded-xl p-5 shadow-lg`}>
            <h3 className="text-base font-semibold mb-2 text-foreground">Delete User</h3>
            <p className="mb-5 text-muted-foreground">Are you sure you want to remove this user?</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className={`flex-1 px-4 py-2.5 rounded-lg font-semibold bg-muted text-foreground border border-border`}>Cancel</button>
              <button onClick={() => { onDeleteUser(deleteConfirm); setDeleteConfirm(null); }} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 shadow-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
