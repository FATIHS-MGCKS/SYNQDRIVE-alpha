import { Activity, AlertCircle, Briefcase, Building2, Calendar, Car, Clock, CreditCard, Crown, Eye, FileText, Globe, Headphones, LayoutDashboard, ListTodo, Lock, Mail, MapPin, MessageSquare, Monitor, Phone, Shield, Smartphone, Tag, Upload, UserCog, Users, Wifi, Zap, type LucideIcon } from 'lucide-react';
import { Icon } from './ui/Icon';
import { useState, useEffect, useMemo, useCallback } from 'react';

import { api } from '../../lib/api';

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface OrgUser {
  id: string;
  membershipId: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  roleKey: string;
  roleLabel: string;
  organizationId: string;
  organizationName: string;
  department: string;
  position: string;
  stationScope: string;
  fieldAgentAccess: boolean;
  permissions: Record<string, { read: boolean; write: boolean }> | null;
  status: string;
  membershipStatus: string;
  lastActive: string;
  lastLoginAt: string;
  createdAt: string;
  avatar: string;
  phone: string;
  mobile: string;
  address: string;
  language: string;
  timezone: string;
  dateFormat: string;
  mustChangePassword: boolean;
  lastLoginIp: string;
  lastLoginDevice: string;
}

interface Station {
  id: string;
  name: string;
  city?: string | null;
}

type WizardStep = 'role' | 'personal' | 'settings' | 'permissions' | 'account';

// ────────────────────────────────────────────────
// Permission module definitions
// ────────────────────────────────────────────────

type PermissionModule = { key: string; label: string; icon: LucideIcon; group: string };

const PERMISSION_MODULES: PermissionModule[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Operations' },
  { key: 'bookings', label: 'Bookings', icon: Calendar, group: 'Operations' },
  { key: 'fleet', label: 'Fleet', icon: Car, group: 'Operations' },
  { key: 'customers', label: 'Customers', icon: Users, group: 'Operations' },
  { key: 'stations', label: 'Stations', icon: MapPin, group: 'Operations' },
  { key: 'fleet-condition', label: 'Fleet — Health', icon: Activity, group: 'Fleet' },
  { key: 'invoices', label: 'Invoices', icon: FileText, group: 'Finance' },
  { key: 'fines', label: 'Fines', icon: AlertCircle, group: 'Finance' },
  { key: 'price-tariffs', label: 'Pricing & Tariffs', icon: Tag, group: 'Finance' },
  { key: 'tasks', label: 'Task Management', icon: ListTodo, group: 'Tasks' },
  { key: 'vendor-management', label: 'Fleet — Service', icon: Briefcase, group: 'Fleet' },
  { key: 'ai-assistant', label: 'AI Assistant', icon: MessageSquare, group: 'Automation' },
  { key: 'workflow-automation', label: 'Workflow Automation', icon: Zap, group: 'Automation' },
  { key: 'document-upload', label: 'Document Upload', icon: Upload, group: 'Automation' },
  { key: 'company-info', label: 'Company Information', icon: Building2, group: 'Administration' },
  { key: 'users-roles', label: 'Users & Roles', icon: UserCog, group: 'Administration' },
  { key: 'fleet-connectivity', label: 'Fleet Connectivity', icon: Wifi, group: 'Administration' },
  { key: 'data-authorization', label: 'Data Authorization Access', icon: Lock, group: 'Administration' },
  { key: 'billing', label: 'Billing & Subscription', icon: CreditCard, group: 'Administration' },
  { key: 'support', label: 'Help Center', icon: Headphones, group: 'Support' },
];

type PermKey = (typeof PERMISSION_MODULES)[number]['key'];

function defaultPermissions(role: string): Record<string, { read: boolean; write: boolean }> {
  const perms: Record<string, { read: boolean; write: boolean }> = {};
  for (const m of PERMISSION_MODULES) {
    if (role === 'ORG_ADMIN') {
      perms[m.key] = { read: true, write: true };
    } else if (role === 'SUB_ADMIN') {
      perms[m.key] = { read: true, write: m.group !== 'Administration' };
    } else {
      perms[m.key] = { read: ['dashboard', 'fleet', 'bookings', 'customers', 'stations', 'tasks', 'support'].includes(m.key), write: false };
    }
  }
  return perms;
}

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    return name.slice(0, 2).toUpperCase();
  }
  return email ? email.slice(0, 2).toUpperCase() : 'U';
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let pw = '';
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// ────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────

interface UsersRolesTabProps {
  isDarkMode: boolean;
  orgId?: string;
}

export function UsersRolesTab({ isDarkMode, orgId }: UsersRolesTabProps) {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const [showWizard, setShowWizard] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadUsers = useCallback(async () => {
    if (!orgId) { setUsers([]); setLoading(false); return; }
    try {
      setLoading(true);
      const list = await api.users.listByOrg(orgId);
      setUsers((list || []).filter((u: OrgUser) => u.membershipStatus !== 'REMOVED'));
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, [orgId]);

  const loadStations = useCallback(async () => {
    if (!orgId) { setStations([]); return; }
    try {
      const list = await api.stations.list(orgId);
      setStations(list || []);
    } catch { setStations([]); }
  }, [orgId]);

  useEffect(() => { loadUsers(); loadStations(); }, [loadUsers, loadStations]);

  // ── Styling constants ────
  const cardClass = 'sq-card rounded-2xl p-5 shadow-[var(--shadow-1)]';
  const textPrimary = 'text-foreground';
  const textSecondary = 'text-muted-foreground';
  const inputClass = 'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all duration-200 outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]';
  const btnPrimary = 'px-4 py-2.5 bg-[var(--brand)] text-[var(--brand-foreground)] rounded-xl text-xs font-semibold hover:bg-[var(--brand-hover)] transition-colors shadow-[var(--shadow-2)] active:scale-[0.98]';
  const btnSecondary = 'px-4 py-2.5 rounded-xl text-xs font-semibold transition-colors border border-border/70 bg-card text-foreground hover:bg-muted/60';
  const btnDanger = 'px-4 py-2.5 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition-colors active:scale-[0.98]';

  const roleColors: Record<string, string> = {
    'Org Admin': 'sq-tone-brand border-transparent',
    'Sub Admin': 'sq-tone-info border-transparent',
    Worker: 'sq-tone-success border-transparent',
    Driver: 'sq-tone-warning border-transparent',
  };

  const roleIcons: Record<string, typeof Crown> = { 'Org Admin': Crown, 'Sub Admin': Shield, 'Worker': UserCog, 'Driver': Car };
  const roleOptions = [
    { key: 'all', label: 'All users', shortLabel: 'Alle', description: 'Alle aktiven Memberships', icon: Users, tone: 'sq-tone-neutral' },
    { key: 'Org Admin', label: 'Org Admin', shortLabel: 'Org Admin', description: 'Vollzugriff auf Organisation', icon: Crown, tone: 'sq-tone-brand' },
    { key: 'Sub Admin', label: 'Sub Admin', shortLabel: 'Sub Admin', description: 'Standort- oder Bereichsleitung', icon: Shield, tone: 'sq-tone-info' },
    { key: 'Worker', label: 'Worker', shortLabel: 'Worker', description: 'Operative Rollen mit Scope', icon: UserCog, tone: 'sq-tone-success' },
    { key: 'Driver', label: 'Driver', shortLabel: 'Driver', description: 'Fahrerzugriff, falls vorhanden', icon: Car, tone: 'sq-tone-warning' },
  ];

  const filteredUsers = useMemo(() =>
    users.filter(u => {
      if (searchTerm && !u.name.toLowerCase().includes(searchTerm.toLowerCase()) && !u.email.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      return true;
    }),
  [users, searchTerm, roleFilter]);

  const roleCounts = useMemo(() => {
    const c: Record<string, number> = { all: users.length };
    users.forEach(u => { c[u.role] = (c[u.role] || 0) + 1; });
    return c;
  }, [users]);
  const visibleRoleOptions = roleOptions.filter(o => o.key !== 'Driver' || (roleCounts.Driver ?? 0) > 0 || roleFilter === 'Driver');
  const activeRoleOption = visibleRoleOptions.find(o => o.key === roleFilter) ?? roleOptions[0];
  const ActiveRoleIcon = activeRoleOption.icon;
  const activeUserCount = useMemo(() => users.filter(u => u.status === 'Active').length, [users]);
  const invitedUserCount = useMemo(() => users.filter(u => u.status === 'Invited').length, [users]);
  const adminUserCount = (roleCounts['Org Admin'] ?? 0) + (roleCounts['Sub Admin'] ?? 0);
  const scopedUserCount = useMemo(() => users.filter(u => Boolean(u.stationScope?.trim())).length, [users]);
  const hasActiveFilters = searchTerm.trim().length > 0 || roleFilter !== 'all';
  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('all');
  };
  const summaryCards = [
    { label: 'Users', value: users.length, meta: `${filteredUsers.length} shown`, icon: Users, tone: 'sq-tone-neutral', filter: 'all' },
    { label: 'Active', value: activeUserCount, meta: `${invitedUserCount} invited`, icon: Activity, tone: activeUserCount > 0 ? 'sq-tone-success' : 'sq-tone-neutral', filter: 'all' },
    { label: 'Admins', value: adminUserCount, meta: `${roleCounts['Org Admin'] ?? 0} org admins`, icon: Shield, tone: adminUserCount > 0 ? 'sq-tone-brand' : 'sq-tone-neutral', filter: 'Org Admin' },
    { label: 'Station Scope', value: scopedUserCount, meta: `${stations.length} stations`, icon: MapPin, tone: scopedUserCount > 0 ? 'sq-tone-info' : 'sq-tone-neutral', filter: 'all' },
  ];

  // ────────────────────────────────────────────────
  // DELETE handler
  // ────────────────────────────────────────────────
  const handleDelete = async (userId: string) => {
    if (!orgId) return;
    try {
      await api.users.deleteByOrg(orgId, userId);
      showToast('Benutzer entfernt');
      setShowDeleteConfirm(null);
      setSelectedUser(null);
      loadUsers();
    } catch { showToast('Fehler beim Entfernen', 'error'); }
  };

  // ────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────
  return (
    <div className="max-w-[1600px] mx-auto space-y-5 relative">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-4 py-3 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-2 ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <Icon name="check-circle" className="w-4 h-4" /> : <Icon name="alert-circle" className="w-4 h-4" />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="min-h-8 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.018em] text-foreground">Users & Roles</h2>
          <p className="text-[13px] mt-1 text-muted-foreground">
            Manage organization users, role scopes, station access and permission presets from one workspace.
          </p>
        </div>
        <button onClick={() => setShowWizard(true)} className={btnPrimary + ' flex items-center gap-2'}>
          <Icon name="user-plus" className="w-4 h-4" /> Benutzer erstellen
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {summaryCards.map(card => {
          const CardIcon = card.icon;
          const active = roleFilter === card.filter && (card.filter !== 'all' || searchTerm.trim() === '');
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setRoleFilter(card.filter)}
              aria-pressed={active}
              className={`${cardClass} text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] active:scale-[0.99] ${
                active ? 'ring-1 ring-[var(--brand)]' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">{card.label}</p>
                  <p className="mt-2 text-[22px] leading-none font-semibold tracking-[-0.02em] text-foreground tabular-nums">{card.value}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">{card.meta}</p>
                </div>
                <div className={`${card.tone} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
                  <CardIcon className="w-5 h-5" />
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <p className="text-[13px] font-semibold text-foreground">Search & Role Scope</p>
            <p className="text-[11px] text-muted-foreground">
              Showing {filteredUsers.length} of {users.length} users · active scope: {activeRoleOption.label}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors text-[var(--brand)] hover:bg-[var(--brand-soft)]"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Suchen nach Name oder E-Mail..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${inputClass} !pl-9`}
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className={inputClass}
          >
            {visibleRoleOptions.map(option => (
              <option key={option.key} value={option.key}>
                {option.shortLabel} ({roleCounts[option.key] ?? 0})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold ${activeRoleOption.tone}`}>
            <ActiveRoleIcon className="w-3 h-3" />
            {activeRoleOption.description}
          </span>
          {searchTerm.trim() && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-info">
              Search: {searchTerm.trim()}
            </span>
          )}
          {stations.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold sq-tone-neutral">
              <Icon name="map-pin" className="w-3 h-3" />
              {stations.length} Standorte
            </span>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className={cardClass}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="refresh-cw" className={`w-5 h-5 animate-spin ${textSecondary}`} />
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <Icon name="users" className={`w-10 h-10 mx-auto mb-3 ${textSecondary} opacity-40`} />
            <p className={`text-sm font-medium ${textPrimary}`}>Keine Benutzer gefunden</p>
            <p className={`text-xs mt-1 ${textSecondary}`}>{searchTerm || roleFilter !== 'all' ? 'Versuchen Sie andere Filter.' : 'Erstellen Sie den ersten Benutzer.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className={isDarkMode ? 'bg-neutral-800/50' : 'bg-gray-50/80'}>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Benutzer</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Rolle</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Abteilung</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Standort-Scope</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Status</th>
                  <th className={`text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}>Zuletzt aktiv</th>
                  <th className={`text-right px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ${textSecondary}`}></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => {
                  const RoleIcon = roleIcons[user.role] || Eye;
                  return (
                    <tr key={user.id} onClick={() => setSelectedUser(user)} className={`border-t group cursor-pointer transition-colors ${isDarkMode ? 'border-neutral-700/30 hover:bg-neutral-800/40' : 'border-gray-100 hover:bg-gray-50/60'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDarkMode ? 'bg-neutral-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                            {user.avatar || getInitials(user.name, user.email)}
                          </div>
                          <div>
                            <p className={`text-xs font-semibold ${textPrimary}`}>{user.name || user.email}</p>
                            <p className={`text-[11px] ${textSecondary}`}>{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${roleColors[user.role] || (isDarkMode ? 'bg-gray-500/20 text-gray-400 border-gray-500/30' : 'bg-gray-100 text-gray-600 border-gray-200')}`}>
                          <RoleIcon className="w-3 h-3" /> {user.role}
                        </span>
                        {user.roleLabel && <p className={`text-[10px] mt-0.5 ${textSecondary}`}>{user.roleLabel}</p>}
                      </td>
                      <td className={`px-4 py-3 text-xs ${textSecondary}`}>{user.department || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${isDarkMode ? 'bg-neutral-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          {user.stationScope || 'Alle Standorte'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : user.status === 'Invited' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                          <span className={`text-xs font-medium ${user.status === 'Active' ? 'text-emerald-500' : user.status === 'Invited' ? 'text-amber-500' : textSecondary}`}>
                            {user.status === 'Active' ? 'Aktiv' : user.status === 'Invited' ? 'Eingeladen' : 'Inaktiv'}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 text-xs ${textSecondary}`}>{formatDate(user.lastLoginAt || user.lastActive)}</td>
                      <td className="px-4 py-3 text-right">
                        <Icon name="chevron-right" className={`w-4 h-4 inline ${textSecondary} opacity-0 group-hover:opacity-100 transition-opacity`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Wizard Overlay */}
      {showWizard && (
        <CreateUserWizard
          isDarkMode={isDarkMode}
          orgId={orgId || ''}
          stations={stations}
          onClose={() => setShowWizard(false)}
          onCreated={() => { setShowWizard(false); loadUsers(); showToast('Benutzer erfolgreich erstellt'); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* User Detail Drawer */}
      {selectedUser && !editingUser && (
        <UserDetailDrawer
          isDarkMode={isDarkMode}
          user={selectedUser}
          orgId={orgId || ''}
          stations={stations}
          onClose={() => setSelectedUser(null)}
          onEdit={() => setEditingUser(selectedUser)}
          onDelete={() => setShowDeleteConfirm(selectedUser.id)}
          onPasswordChange={() => setShowPasswordModal(selectedUser.id)}
          cardClass={cardClass}
          textPrimary={textPrimary}
          textSecondary={textSecondary}
        />
      )}

      {/* Edit User Drawer */}
      {editingUser && (
        <EditUserDrawer
          isDarkMode={isDarkMode}
          user={editingUser}
          orgId={orgId || ''}
          stations={stations}
          onClose={() => { setEditingUser(null); }}
          onSaved={() => { setEditingUser(null); setSelectedUser(null); loadUsers(); showToast('Änderungen gespeichert'); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)}>
          <div className={`${cardClass} max-w-sm w-full mx-4`} onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Icon name="trash-2" className="w-6 h-6 text-red-600" />
              </div>
              <h3 className={`text-sm font-bold ${textPrimary}`}>Benutzer entfernen?</h3>
              <p className={`text-xs mt-2 ${textSecondary}`}>Der Benutzer wird aus der Organisation entfernt. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowDeleteConfirm(null)} className={btnSecondary + ' flex-1'}>Abbrechen</button>
              <button onClick={() => handleDelete(showDeleteConfirm)} className={btnDanger + ' flex-1'}>Entfernen</button>
            </div>
          </div>
        </div>
      )}

      {/* Password change modal */}
      {showPasswordModal && (
        <PasswordChangeModal
          isDarkMode={isDarkMode}
          orgId={orgId || ''}
          userId={showPasswordModal}
          onClose={() => setShowPasswordModal(null)}
          onSuccess={() => { setShowPasswordModal(null); showToast('Passwort aktualisiert'); }}
          onError={(msg) => showToast(msg, 'error')}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════
// CREATE USER WIZARD (5-step)
// ════════════════════════════════════════════════

function CreateUserWizard({ isDarkMode, orgId, stations, onClose, onCreated, onError }: {
  isDarkMode: boolean;
  orgId: string;
  stations: Station[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [step, setStep] = useState<WizardStep>('role');
  const [saving, setSaving] = useState(false);

  const [role, setRole] = useState<'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER'>('WORKER');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [stationScope, setStationScope] = useState('');
  const [language, setLanguage] = useState('de');
  const [timezone, setTimezone] = useState('Europe/Berlin');
  const [dateFormat, setDateFormat] = useState('DD.MM.YYYY');
  const [permissions, setPermissions] = useState<Record<string, { read: boolean; write: boolean }>>(() => defaultPermissions('WORKER'));
  const [fieldAgentAccess, setFieldAgentAccess] = useState(false);
  const [accountMethod, setAccountMethod] = useState<'password' | 'invite'>('password');
  const [generatedPassword, setGeneratedPassword] = useState(() => generatePassword());
  const [copiedPw, setCopiedPw] = useState(false);

  const steps: WizardStep[] = ['role', 'personal', 'settings', 'permissions', 'account'];
  const stepLabels: Record<WizardStep, string> = { role: 'Rolle', personal: 'Persönliche Daten', settings: 'Einstellungen', permissions: 'Berechtigungen', account: 'Konto-Setup' };
  const currentIdx = steps.indexOf(step);
  const canNext = (() => {
    if (step === 'role') return true;
    if (step === 'personal') return !!firstName.trim() && !!lastName.trim() && !!email.trim();
    if (step === 'settings') return true;
    if (step === 'permissions') return true;
    return true;
  })();

  const handleRoleChange = (r: 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER') => {
    setRole(r);
    setPermissions(defaultPermissions(r));
    setFieldAgentAccess(r === 'ORG_ADMIN');
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await api.users.createByOrg(orgId, {
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        password: accountMethod === 'password' ? generatedPassword : undefined,
        inviteByEmail: accountMethod === 'invite',
        phone: phone.trim() || undefined,
        mobile: mobile.trim() || undefined,
        address: address.trim() || undefined,
        position: position.trim() || undefined,
        department: department.trim() || undefined,
        roleLabel: roleLabel.trim() || undefined,
        stationScope: stationScope || undefined,
        language,
        timezone,
        dateFormat,
        permissions: role === 'ORG_ADMIN' ? undefined : permissions,
        fieldAgentAccess: role === 'ORG_ADMIN' ? true : fieldAgentAccess,
      });
      onCreated();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Fehler beim Erstellen');
    } finally { setSaving(false); }
  };

  const cardClass = `rounded-xl p-5 shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'} outline-none`;
  const labelClass = `block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`${cardClass} max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className={`text-base font-bold ${textPrimary}`}>Neuen Benutzer erstellen</h3>
            <p className={`text-xs mt-0.5 ${textSecondary}`}>Schritt {currentIdx + 1} von {steps.length} — {stepLabels[step]}</p>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-neutral-700 text-gray-500' : 'hover:bg-gray-100 text-gray-400'}`}>
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold transition-all ${i < currentIdx ? 'bg-emerald-500 text-white' : i === currentIdx ? 'bg-blue-600 text-white ring-4 ring-blue-600/20' : isDarkMode ? 'bg-neutral-800 text-gray-500 border border-neutral-700' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                {i < currentIdx ? <Icon name="check" className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 rounded ${i < currentIdx ? 'bg-emerald-500' : isDarkMode ? 'bg-neutral-700' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>

        {/* STEP 1: Role selection */}
        {step === 'role' && (
          <div className="space-y-3">
            <p className={`text-xs font-medium ${textPrimary} mb-3`}>Welche Rolle soll der neue Benutzer haben?</p>
            {([
              { key: 'ORG_ADMIN' as const, label: 'Org Admin', desc: 'Vollzugriff auf die gesamte Organisation. Geschäftsführer / Hauptadministrator.', icon: Crown, color: 'purple' },
              { key: 'SUB_ADMIN' as const, label: 'Sub Admin', desc: 'Abteilungs-/Standortleiter mit konfigurierbarem Zugriff auf einen oder mehrere Standorte.', icon: Shield, color: 'blue' },
              { key: 'WORKER' as const, label: 'Worker', desc: 'Operativer Mitarbeiter mit individuell konfigurierbaren Zugriffsrechten.', icon: UserCog, color: 'emerald' },
            ]).map(r => (
              <button key={r.key} onClick={() => handleRoleChange(r.key)} className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${role === r.key ? `border-${r.color}-500 ${isDarkMode ? `bg-${r.color}-500/10` : `bg-${r.color}-50`}` : isDarkMode ? 'border-neutral-700 hover:border-neutral-600' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${role === r.key ? `bg-${r.color}-500/20 text-${r.color}-400` : isDarkMode ? 'bg-neutral-800 text-gray-500' : 'bg-gray-100 text-gray-400'}`}>
                  <r.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-bold ${textPrimary}`}>{r.label}</p>
                  <p className={`text-xs mt-0.5 ${textSecondary}`}>{r.desc}</p>
                </div>
                {role === r.key && <Icon name="check" className={`w-5 h-5 text-${r.color}-500 mt-1`} />}
              </button>
            ))}
          </div>
        )}

        {/* STEP 2: Personal info */}
        {step === 'personal' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Nachname *</label>
                <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} placeholder="Mustermann" />
              </div>
              <div>
                <label className={labelClass}>Vorname *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} placeholder="Max" />
              </div>
            </div>
            <div>
              <label className={labelClass}>E-Mail-Adresse *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} placeholder="max.mustermann@synqdrive.de" />
            </div>
            <div>
              <label className={labelClass}>Adresse</label>
              <input value={address} onChange={e => setAddress(e.target.value)} className={inputClass} placeholder="Musterstraße 12, 10115 Berlin" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Telefon</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="+49 30 1234567" />
              </div>
              <div>
                <label className={labelClass}>Mobil</label>
                <input value={mobile} onChange={e => setMobile(e.target.value)} className={inputClass} placeholder="+49 170 1234567" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Position</label>
                <input value={position} onChange={e => setPosition(e.target.value)} className={inputClass} placeholder="z.B. Fuhrparkleiter" />
              </div>
              <div>
                <label className={labelClass}>Abteilung</label>
                <input value={department} onChange={e => setDepartment(e.target.value)} className={inputClass} placeholder="z.B. Operations" />
              </div>
            </div>
            {role === 'WORKER' && (
              <div>
                <label className={labelClass}>Aufgabenbezeichnung / Rolle-Label</label>
                <input value={roleLabel} onChange={e => setRoleLabel(e.target.value)} className={inputClass} placeholder="z.B. Buchhaltung, Werkstatt, Disposition" />
              </div>
            )}
            <div>
              <label className={labelClass}>Station</label>
              <select value={stationScope} onChange={e => setStationScope(e.target.value)} className={inputClass}>
                <option value="">Alle Standorte</option>
                {stations.map(s => <option key={s.id} value={s.name}>{s.name}{s.city ? ` (${s.city})` : ''}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* STEP 3: Settings */}
        {step === 'settings' && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Sprache</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className={inputClass}>
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="es">Español</option>
                <option value="tr">Türkçe</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Zeitzone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputClass}>
                <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                <option value="Europe/Zurich">Europe/Zurich (CET/CEST)</option>
                <option value="Europe/Vienna">Europe/Vienna (CET/CEST)</option>
                <option value="Europe/Istanbul">Europe/Istanbul (TRT)</option>
                <option value="America/New_York">America/New_York (EST/EDT)</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Datumsformat</label>
              <select value={dateFormat} onChange={e => setDateFormat(e.target.value)} className={inputClass}>
                <option value="DD.MM.YYYY">DD.MM.YYYY (31.12.2026)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (12/31/2026)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (2026-12-31)</option>
              </select>
            </div>
          </div>
        )}

        {/* STEP 4: Permissions */}
        {step === 'permissions' && (
          <div className="space-y-4">
            {role === 'ORG_ADMIN' ? (
              <div className={`rounded-xl p-4 ${isDarkMode ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="crown" className="w-4 h-4 text-purple-500" />
                  <p className={`text-xs font-bold ${textPrimary}`}>Vollzugriff</p>
                </div>
                <p className={`text-xs ${textSecondary}`}>Org Admins haben automatisch vollen Lese- und Schreibzugriff auf alle Module und den Field Agent App.</p>
              </div>
            ) : (
              <>
                {/* Field Agent toggle */}
                <div className={`flex items-center justify-between p-3 rounded-xl border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-3">
                    <Icon name="smartphone" className={`w-4 h-4 ${fieldAgentAccess ? 'text-blue-500' : textSecondary}`} />
                    <div>
                      <p className={`text-xs font-semibold ${textPrimary}`}>Field Agent App Zugang</p>
                      <p className={`text-[11px] ${textSecondary}`}>Zugriff auf die mobile Field Agent App</p>
                    </div>
                  </div>
                  <button onClick={() => setFieldAgentAccess(!fieldAgentAccess)} className={`w-10 h-5 rounded-full transition-colors relative ${fieldAgentAccess ? 'bg-blue-600' : isDarkMode ? 'bg-neutral-700' : 'bg-gray-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${fieldAgentAccess ? 'left-5.5' : 'left-0.5'}`} style={{ left: fieldAgentAccess ? '22px' : '2px' }} />
                  </button>
                </div>

                {/* Permission matrix */}
                <PermissionMatrix
                  isDarkMode={isDarkMode}
                  permissions={permissions}
                  onChange={setPermissions}
                  disabled={false}
                />
              </>
            )}
          </div>
        )}

        {/* STEP 5: Account setup */}
        {step === 'account' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setAccountMethod('password')} className={`p-4 rounded-xl border-2 text-left transition-all ${accountMethod === 'password' ? (isDarkMode ? 'border-blue-500 bg-blue-500/10' : 'border-blue-500 bg-blue-50') : isDarkMode ? 'border-neutral-700 hover:border-neutral-600' : 'border-gray-200 hover:border-gray-300'}`}>
                <Icon name="key" className={`w-5 h-5 mb-2 ${accountMethod === 'password' ? 'text-blue-500' : textSecondary}`} />
                <p className={`text-xs font-bold ${textPrimary}`}>Einmal-Passwort</p>
                <p className={`text-[11px] mt-0.5 ${textSecondary}`}>Generiertes Passwort, muss beim ersten Login geändert werden</p>
              </button>
              <button onClick={() => setAccountMethod('invite')} className={`p-4 rounded-xl border-2 text-left transition-all ${accountMethod === 'invite' ? (isDarkMode ? 'border-blue-500 bg-blue-500/10' : 'border-blue-500 bg-blue-50') : isDarkMode ? 'border-neutral-700 hover:border-neutral-600' : 'border-gray-200 hover:border-gray-300'}`}>
                <Icon name="mail" className={`w-5 h-5 mb-2 ${accountMethod === 'invite' ? 'text-blue-500' : textSecondary}`} />
                <p className={`text-xs font-bold ${textPrimary}`}>E-Mail Einladung</p>
                <p className={`text-[11px] mt-0.5 ${textSecondary}`}>Benutzer erhält eine Einladung per E-Mail</p>
              </button>
            </div>

            {accountMethod === 'password' && (
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                <label className={`block text-[11px] font-semibold mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'} uppercase tracking-wider`}>Generiertes Einmal-Passwort</label>
                <div className="flex items-center gap-2">
                  <code className={`flex-1 px-3 py-2.5 rounded-lg text-xs font-mono tracking-wider ${isDarkMode ? 'bg-neutral-900 text-emerald-400 border border-neutral-700' : 'bg-white text-emerald-700 border border-gray-200'}`}>{generatedPassword}</code>
                  <button onClick={() => { navigator.clipboard.writeText(generatedPassword); setCopiedPw(true); setTimeout(() => setCopiedPw(false), 2000); }} className={`p-2.5 rounded-lg transition-colors ${copiedPw ? 'bg-emerald-500 text-white' : isDarkMode ? 'bg-neutral-700 text-gray-300 hover:bg-neutral-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                    {copiedPw ? <Icon name="check" className="w-4 h-4" /> : <Icon name="copy" className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setGeneratedPassword(generatePassword())} className={`p-2.5 rounded-lg transition-colors ${isDarkMode ? 'bg-neutral-700 text-gray-300 hover:bg-neutral-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}>
                    <Icon name="refresh-cw" className="w-4 h-4" />
                  </button>
                </div>
                <p className={`text-[11px] mt-2 ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'} flex items-center gap-1`}>
                  <Icon name="alert-circle" className="w-3 h-3" /> Der Benutzer muss dieses Passwort beim ersten Login ändern.
                </p>
              </div>
            )}

            {accountMethod === 'invite' && (
              <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                <p className={`text-xs ${textSecondary}`}>Eine Einladungs-E-Mail wird an <strong className={textPrimary}>{email || '...'}</strong> gesendet. Der Benutzer kann dann ein eigenes Passwort setzen.</p>
              </div>
            )}

            {/* Summary */}
            <div className={`rounded-xl p-4 border ${isDarkMode ? 'bg-neutral-800/20 border-neutral-700/30' : 'bg-gray-50/50 border-gray-200'}`}>
              <p className={`text-[11px] font-semibold mb-2 ${textSecondary} uppercase tracking-wider`}>Zusammenfassung</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {[
                  ['Name', `${firstName} ${lastName}`],
                  ['E-Mail', email],
                  ['Rolle', role === 'ORG_ADMIN' ? 'Org Admin' : role === 'SUB_ADMIN' ? 'Sub Admin' : 'Worker'],
                  ['Abteilung', department || '—'],
                  ['Station', stationScope || 'Alle Standorte'],
                  ['Field Agent', role === 'ORG_ADMIN' ? 'Ja' : fieldAgentAccess ? 'Ja' : 'Nein'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className={`text-[11px] ${textSecondary}`}>{k}</span>
                    <span className={`text-[11px] font-medium ${textPrimary}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
          <button onClick={() => currentIdx > 0 ? setStep(steps[currentIdx - 1]) : onClose()} className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors border flex items-center gap-1.5 ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:bg-neutral-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
            <Icon name="chevron-left" className="w-3.5 h-3.5" /> {currentIdx > 0 ? 'Zurück' : 'Abbrechen'}
          </button>
          {currentIdx < steps.length - 1 ? (
            <button onClick={() => setStep(steps[currentIdx + 1])} disabled={!canNext} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
              Weiter <Icon name="chevron-right" className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-1.5">
              {saving ? <Icon name="refresh-cw" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check" className="w-3.5 h-3.5" />}
              Benutzer erstellen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// PERMISSION MATRIX
// ════════════════════════════════════════════════

function PermissionMatrix({ isDarkMode, permissions, onChange, disabled }: {
  isDarkMode: boolean;
  permissions: Record<string, { read: boolean; write: boolean }>;
  onChange: (p: Record<string, { read: boolean; write: boolean }>) => void;
  disabled: boolean;
}) {
  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const groups = useMemo(() => {
    const g: Record<string, typeof PERMISSION_MODULES[number][]> = {};
    PERMISSION_MODULES.forEach(m => {
      if (!g[m.group]) g[m.group] = [];
      g[m.group].push(m);
    });
    return g;
  }, []);

  const toggle = (key: string, field: 'read' | 'write') => {
    if (disabled) return;
    const current = permissions[key] || { read: false, write: false };
    const updated = { ...current };
    if (field === 'write') {
      updated.write = !updated.write;
      if (updated.write) updated.read = true;
    } else {
      updated.read = !updated.read;
      if (!updated.read) updated.write = false;
    }
    onChange({ ...permissions, [key]: updated });
  };

  const toggleGroup = (group: string, field: 'read' | 'write', enable: boolean) => {
    if (disabled) return;
    const updated = { ...permissions };
    groups[group].forEach(m => {
      const current = updated[m.key] || { read: false, write: false };
      if (field === 'write') {
        updated[m.key] = { read: enable ? true : current.read, write: enable };
      } else {
        updated[m.key] = { read: enable, write: enable ? current.write : false };
      }
    });
    onChange(updated);
  };

  const CheckBox = ({ checked, onClick, accent }: { checked: boolean; onClick: () => void; accent?: boolean }) => (
    <button onClick={onClick} disabled={disabled} className={`w-5 h-5 rounded flex items-center justify-center transition-all border ${checked ? (accent ? 'bg-blue-600 border-blue-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white') : isDarkMode ? 'border-neutral-600 hover:border-neutral-500 bg-neutral-800' : 'border-gray-300 hover:border-gray-400 bg-white'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      {checked && <Icon name="check" className="w-3 h-3" />}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className={`text-[11px] font-semibold ${textSecondary} uppercase tracking-wider`}>Modul-Berechtigungen</p>
        <div className="flex gap-6 pr-1">
          <span className={`text-[10px] font-semibold ${textSecondary} uppercase`}>Lesen</span>
          <span className={`text-[10px] font-semibold ${textSecondary} uppercase`}>Schreiben</span>
        </div>
      </div>
      {Object.entries(groups).map(([group, modules]) => {
        const allRead = modules.every(m => permissions[m.key]?.read);
        const allWrite = modules.every(m => permissions[m.key]?.write);
        return (
          <div key={group} className={`rounded-xl border overflow-hidden ${isDarkMode ? 'border-neutral-700' : 'border-gray-200'}`}>
            <div className={`flex items-center justify-between px-3 py-2 ${isDarkMode ? 'bg-neutral-800' : 'bg-gray-50'}`}>
              <p className={`text-[11px] font-bold ${textPrimary} uppercase tracking-wider`}>{group}</p>
              <div className="flex gap-6 pr-1">
                <CheckBox checked={allRead} onClick={() => toggleGroup(group, 'read', !allRead)} />
                <CheckBox checked={allWrite} onClick={() => toggleGroup(group, 'write', !allWrite)} accent />
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.3)' : 'rgb(243 244 246)' }}>
              {modules.map(m => {
                const p = permissions[m.key] || { read: false, write: false };
                const Icon = m.icon;
                return (
                  <div key={m.key} className={`flex items-center justify-between px-3 py-2 ${isDarkMode ? 'hover:bg-neutral-800/30' : 'hover:bg-gray-50/50'}`}>
                    <div className="flex items-center gap-2">
                      <Icon className={`w-3.5 h-3.5 ${textSecondary}`} />
                      <span className={`text-xs ${textPrimary}`}>{m.label}</span>
                    </div>
                    <div className="flex gap-6 pr-1">
                      <CheckBox checked={p.read} onClick={() => toggle(m.key, 'read')} />
                      <CheckBox checked={p.write} onClick={() => toggle(m.key, 'write')} accent />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════
// USER DETAIL DRAWER
// ════════════════════════════════════════════════

function UserDetailDrawer({ isDarkMode, user, orgId, stations, onClose, onEdit, onDelete, onPasswordChange, cardClass, textPrimary, textSecondary }: {
  isDarkMode: boolean;
  user: OrgUser;
  orgId: string;
  stations: Station[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPasswordChange: () => void;
  cardClass: string;
  textPrimary: string;
  textSecondary: string;
}) {
  const RoleIcon = { 'Org Admin': Crown, 'Sub Admin': Shield, Worker: UserCog, Driver: Car }[user.role] || Eye;
  const roleColor = isDarkMode
    ? { 'Org Admin': 'text-purple-400', 'Sub Admin': 'text-blue-400', Worker: 'text-emerald-400' }[user.role] || 'text-gray-400'
    : { 'Org Admin': 'text-purple-600', 'Sub Admin': 'text-blue-600', Worker: 'text-emerald-600' }[user.role] || 'text-gray-600';

  const infoRow = (label: string, value: string, icon?: typeof Phone) => {
    const Icon = icon;
    return (
      <div className="flex items-start gap-3 py-2">
        {Icon && <Icon className={`w-3.5 h-3.5 mt-0.5 ${textSecondary}`} />}
        {!Icon && <div className="w-3.5" />}
        <div className="flex-1">
          <p className={`text-[10px] uppercase tracking-wider font-semibold ${textSecondary}`}>{label}</p>
          <p className={`text-xs font-medium ${textPrimary} mt-0.5`}>{value || '—'}</p>
        </div>
      </div>
    );
  };

  const permissions = user.permissions || (user.roleKey === 'ORG_ADMIN' ? defaultPermissions('ORG_ADMIN') : null);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-lg h-full overflow-y-auto ${isDarkMode ? 'bg-neutral-950' : 'bg-gray-50'} shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold ${isDarkMode ? 'bg-neutral-800 text-white' : 'bg-gray-200 text-gray-800'}`}>
                {user.avatar || getInitials(user.name, user.email)}
              </div>
              <div>
                <h3 className={`text-base font-bold ${textPrimary}`}>{user.name || user.email}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${roleColor}`}>
                    <RoleIcon className="w-3.5 h-3.5" /> {user.role}
                  </span>
                  {user.roleLabel && <span className={`text-[11px] ${textSecondary}`}>· {user.roleLabel}</span>}
                </div>
              </div>
            </div>
            <button onClick={onClose} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onEdit} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors border ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              <Icon name="edit-3" className="w-3.5 h-3.5" /> Bearbeiten
            </button>
            <button onClick={onPasswordChange} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors border ${isDarkMode ? 'border-neutral-700 text-gray-300 hover:bg-neutral-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
              <Icon name="key" className="w-3.5 h-3.5" /> Passwort
            </button>
            <button onClick={onDelete} className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold transition-colors border border-red-500/30 text-red-500 hover:bg-red-500/10`}>
              <Icon name="trash-2" className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Status */}
          <div className={`${cardClass} !p-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : user.status === 'Invited' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                <span className={`text-xs font-semibold ${user.status === 'Active' ? 'text-emerald-500' : user.status === 'Invited' ? 'text-amber-500' : textSecondary}`}>
                  {user.status === 'Active' ? 'Aktiv' : user.status === 'Invited' ? 'Einladung ausstehend' : 'Inaktiv'}
                </span>
              </div>
              {user.mustChangePassword && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
                  Passwort-Änderung erforderlich
                </span>
              )}
            </div>
          </div>

          {/* Personal */}
          <div className={cardClass}>
            <p className={`text-[11px] font-bold ${textSecondary} uppercase tracking-wider mb-2`}>Persönliche Daten</p>
            {infoRow('E-Mail', user.email, Mail)}
            {infoRow('Telefon', user.phone, Phone)}
            {infoRow('Mobil', user.mobile, Smartphone)}
            {infoRow('Adresse', user.address || '', MapPin)}
            {infoRow('Abteilung', user.department, Building2)}
            {infoRow('Position', user.position, UserCog)}
          </div>

          {/* Access scope */}
          <div className={cardClass}>
            <p className={`text-[11px] font-bold ${textSecondary} uppercase tracking-wider mb-2`}>Zugriff & Scope</p>
            {infoRow('Station-Scope', user.stationScope || 'Alle Standorte', MapPin)}
            {infoRow('Field Agent App', user.fieldAgentAccess ? 'Aktiviert' : 'Deaktiviert', Smartphone)}
          </div>

          {/* Settings */}
          <div className={cardClass}>
            <p className={`text-[11px] font-bold ${textSecondary} uppercase tracking-wider mb-2`}>Einstellungen</p>
            {infoRow('Sprache', user.language === 'de' ? 'Deutsch' : user.language === 'en' ? 'English' : user.language, Globe)}
            {infoRow('Zeitzone', user.timezone, Clock)}
            {infoRow('Datumsformat', user.dateFormat, Calendar)}
          </div>

          {/* Permissions */}
          {permissions && (
            <div className={cardClass}>
              <p className={`text-[11px] font-bold ${textSecondary} uppercase tracking-wider mb-3`}>Berechtigungen</p>
              <PermissionMatrix isDarkMode={isDarkMode} permissions={permissions} onChange={() => {}} disabled />
            </div>
          )}

          {/* Session info */}
          <div className={cardClass}>
            <p className={`text-[11px] font-bold ${textSecondary} uppercase tracking-wider mb-2`}>Sitzungsinformationen</p>
            {infoRow('Letzter Login', formatDate(user.lastLoginAt), Monitor)}
            {infoRow('Erstellt am', formatDate(user.createdAt), Calendar)}
            {user.lastLoginIp && infoRow('IP-Adresse', user.lastLoginIp, Wifi)}
            {user.lastLoginDevice && infoRow('Gerät', user.lastLoginDevice, Monitor)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// EDIT USER DRAWER
// ════════════════════════════════════════════════

function EditUserDrawer({ isDarkMode, user, orgId, stations, onClose, onSaved, onError }: {
  isDarkMode: boolean;
  user: OrgUser;
  orgId: string;
  stations: Station[];
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState(user.firstName || user.name.split(' ')[0] || '');
  const [lastName, setLastName] = useState(user.lastName || user.name.split(' ').slice(1).join(' ') || '');
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [mobile, setMobile] = useState(user.mobile);
  const [address, setAddress] = useState(user.address || '');
  const [position, setPosition] = useState(user.position);
  const [department, setDepartment] = useState(user.department);
  const [roleLabel, setRoleLabel] = useState(user.roleLabel);
  const [role, setRole] = useState(user.roleKey as 'ORG_ADMIN' | 'SUB_ADMIN' | 'WORKER');
  const [stationScope, setStationScope] = useState(user.stationScope);
  const [language, setLanguage] = useState(user.language);
  const [timezone, setTimezone] = useState(user.timezone);
  const [dateFormat, setDateFormat] = useState(user.dateFormat);
  const [fieldAgentAccess, setFieldAgentAccess] = useState(user.fieldAgentAccess);
  const [permissions, setPermissions] = useState<Record<string, { read: boolean; write: boolean }>>(
    user.permissions as Record<string, { read: boolean; write: boolean }> || defaultPermissions(user.roleKey)
  );

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20'} outline-none`;
  const labelClass = `block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`;
  const sectionTitle = (t: string) => <p className={`text-[11px] font-bold ${textSecondary} uppercase tracking-wider mt-5 mb-3`}>{t}</p>;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.users.updateByOrg(orgId, user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        mobile: mobile.trim() || undefined,
        address: address.trim() || undefined,
        position: position.trim() || undefined,
        department: department.trim() || undefined,
        roleLabel: roleLabel.trim() || undefined,
        role,
        stationScope: stationScope || undefined,
        language,
        timezone,
        dateFormat,
        fieldAgentAccess: role === 'ORG_ADMIN' ? true : fieldAgentAccess,
        permissions: role === 'ORG_ADMIN' ? undefined : permissions,
      });
      onSaved();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-lg h-full overflow-y-auto ${isDarkMode ? 'bg-neutral-950' : 'bg-gray-50'} shadow-2xl`} onClick={e => e.stopPropagation()}>
        <div className="p-5 space-y-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className={`text-base font-bold ${textPrimary}`}>Benutzer bearbeiten</h3>
            <button onClick={onClose} className={`p-2 rounded-lg ${isDarkMode ? 'hover:bg-neutral-800 text-gray-500' : 'hover:bg-gray-200 text-gray-400'}`}>
              <Icon name="x" className="w-5 h-5" />
            </button>
          </div>

          {/* Role */}
          {sectionTitle('Rolle')}
          <select value={role} onChange={e => { setRole(e.target.value as typeof role); if (e.target.value === 'ORG_ADMIN') setFieldAgentAccess(true); }} className={inputClass}>
            <option value="ORG_ADMIN">Org Admin</option>
            <option value="SUB_ADMIN">Sub Admin</option>
            <option value="WORKER">Worker</option>
          </select>
          {role === 'WORKER' && (
            <div className="mt-2">
              <label className={labelClass}>Aufgabenbezeichnung</label>
              <input value={roleLabel} onChange={e => setRoleLabel(e.target.value)} className={inputClass} placeholder="z.B. Buchhaltung" />
            </div>
          )}

          {/* Personal */}
          {sectionTitle('Persönliche Daten')}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Nachname</label><input value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Vorname</label><input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} /></div>
          </div>
          <div className="mt-2"><label className={labelClass}>E-Mail</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></div>
          <div className="mt-2"><label className={labelClass}>Adresse</label><input value={address} onChange={e => setAddress(e.target.value)} className={inputClass} /></div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><label className={labelClass}>Telefon</label><input value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Mobil</label><input value={mobile} onChange={e => setMobile(e.target.value)} className={inputClass} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div><label className={labelClass}>Position</label><input value={position} onChange={e => setPosition(e.target.value)} className={inputClass} /></div>
            <div><label className={labelClass}>Abteilung</label><input value={department} onChange={e => setDepartment(e.target.value)} className={inputClass} /></div>
          </div>
          <div className="mt-2">
            <label className={labelClass}>Station-Scope</label>
            <select value={stationScope} onChange={e => setStationScope(e.target.value)} className={inputClass}>
              <option value="">Alle Standorte</option>
              {stations.map(s => <option key={s.id} value={s.name}>{s.name}{s.city ? ` (${s.city})` : ''}</option>)}
            </select>
          </div>

          {/* Settings */}
          {sectionTitle('Einstellungen')}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Sprache</label>
              <select value={language} onChange={e => setLanguage(e.target.value)} className={inputClass}>
                <option value="de">Deutsch</option><option value="en">English</option><option value="fr">Français</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Zeitzone</label>
              <select value={timezone} onChange={e => setTimezone(e.target.value)} className={inputClass}>
                <option value="Europe/Berlin">Europe/Berlin</option><option value="Europe/London">Europe/London</option><option value="Europe/Vienna">Europe/Vienna</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Datumsformat</label>
              <select value={dateFormat} onChange={e => setDateFormat(e.target.value)} className={inputClass}>
                <option value="DD.MM.YYYY">DD.MM.YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </div>
          </div>

          {/* Permissions */}
          {sectionTitle('Berechtigungen')}
          {role === 'ORG_ADMIN' ? (
            <div className={`rounded-xl p-3 ${isDarkMode ? 'bg-purple-500/10 border border-purple-500/20' : 'bg-purple-50 border border-purple-200'}`}>
              <p className={`text-xs ${textSecondary}`}><Icon name="crown" className="w-3.5 h-3.5 inline text-purple-500 mr-1" />Org Admins haben automatisch Vollzugriff.</p>
            </div>
          ) : (
            <>
              <div className={`flex items-center justify-between p-3 rounded-xl mb-3 border ${isDarkMode ? 'bg-neutral-800/40 border-neutral-700' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <Icon name="smartphone" className={`w-4 h-4 ${fieldAgentAccess ? 'text-blue-500' : textSecondary}`} />
                  <span className={`text-xs font-semibold ${textPrimary}`}>Field Agent App</span>
                </div>
                <button onClick={() => setFieldAgentAccess(!fieldAgentAccess)} className={`w-10 h-5 rounded-full transition-colors relative ${fieldAgentAccess ? 'bg-blue-600' : isDarkMode ? 'bg-neutral-700' : 'bg-gray-300'}`}>
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm" style={{ left: fieldAgentAccess ? '22px' : '2px' }} />
                </button>
              </div>
              <PermissionMatrix isDarkMode={isDarkMode} permissions={permissions} onChange={setPermissions} disabled={false} />
            </>
          )}

          {/* Save */}
          <div className="flex gap-3 mt-6 pt-4 border-t" style={{ borderColor: isDarkMode ? 'rgb(64 64 64 / 0.5)' : 'rgb(229 231 235 / 0.5)' }}>
            <button onClick={onClose} className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors border ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:bg-neutral-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              Abbrechen
            </button>
            <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
              {saving ? <Icon name="refresh-cw" className="w-3.5 h-3.5 animate-spin" /> : <Icon name="check" className="w-3.5 h-3.5" />} Speichern
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════
// PASSWORD CHANGE MODAL
// ════════════════════════════════════════════════

function PasswordChangeModal({ isDarkMode, orgId, userId, onClose, onSuccess, onError }: {
  isDarkMode: boolean;
  orgId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState('');

  const textPrimary = isDarkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const cardClass = `rounded-xl p-5 shadow-sm border ${isDarkMode ? 'bg-neutral-900 border-neutral-700' : 'bg-white border-gray-200'}`;
  const inputClass = `w-full px-3 py-2.5 rounded-lg border text-xs transition-all duration-200 ${isDarkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder-gray-500 focus:border-blue-500/50' : 'bg-white border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-400'} outline-none`;

  const handleGenerate = () => { const pw = generatePassword(); setGenerated(pw); setPassword(pw); setConfirm(pw); };

  const handleSubmit = async () => {
    if (password.length < 6) { onError('Passwort muss mindestens 6 Zeichen lang sein'); return; }
    if (password !== confirm) { onError('Passwörter stimmen nicht überein'); return; }
    setSaving(true);
    try {
      await api.users.changePasswordByOrg(orgId, userId, password);
      onSuccess();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Fehler beim Ändern');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`${cardClass} max-w-md w-full mx-4`} onClick={e => e.stopPropagation()}>
        <h3 className={`text-sm font-bold ${textPrimary} mb-4`}>Passwort ändern</h3>
        <div className="space-y-3">
          <div>
            <label className={`block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`}>Neues Passwort</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="Mindestens 6 Zeichen" />
          </div>
          <div>
            <label className={`block text-[11px] font-semibold mb-1.5 ${textSecondary} uppercase tracking-wider`}>Passwort bestätigen</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass} placeholder="Passwort wiederholen" />
          </div>
          <button onClick={handleGenerate} className={`text-xs font-medium ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'} flex items-center gap-1`}>
            <Icon name="refresh-cw" className="w-3 h-3" /> Sicheres Passwort generieren
          </button>
          {generated && (
            <div className={`px-3 py-2 rounded-lg text-xs font-mono ${isDarkMode ? 'bg-neutral-800 text-emerald-400' : 'bg-gray-100 text-emerald-700'}`}>{generated}</div>
          )}
          <p className={`text-[11px] ${isDarkMode ? 'text-amber-400/80' : 'text-amber-600'} flex items-center gap-1`}>
            <Icon name="alert-circle" className="w-3 h-3" /> Der Benutzer wird aufgefordert, das Passwort beim nächsten Login zu ändern.
          </p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className={`flex-1 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors border ${isDarkMode ? 'border-neutral-700 text-gray-400 hover:bg-neutral-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>Abbrechen</button>
          <button onClick={handleSubmit} disabled={saving || password.length < 6 || password !== confirm} className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? 'Speichern...' : 'Passwort setzen'}
          </button>
        </div>
      </div>
    </div>
  );
}
