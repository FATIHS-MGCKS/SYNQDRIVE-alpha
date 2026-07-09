import { Key, Mail, MapPin, Phone, Shield, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DetailDrawer, SectionHeader, Timeline } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import {
  api,
  type MembershipPermissionsMap,
  type OrganizationRoleDto,
  type OrgUserDto,
  type Station,
  type UserSecurityActivityDto,
} from '../../../lib/api';
import { AdminBadge, UserStatusBadge } from './badges';
import { AUDIT_ACTION_LABELS, permissionsFromRoleTemplate } from './constants';
import { CollapsiblePermissions, PermissionPreview } from './PermissionEditor';
import {
  describePermissionChange,
  formatDateTime,
  formatInviteStatus,
  getInitials,
  userDisplayRole,
  userStationLabel,
} from './utils';

interface UserDetailDrawerProps {
  orgId: string;
  user: OrgUserDto;
  stations: Station[];
  stationNameById: Map<string, string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => Promise<void>;
  onError: (err: unknown) => void;
  onRemove: () => void;
  onPasswordReset: () => void;
  canWrite?: boolean;
  canManage?: boolean;
  /** Öffnet direkt im Bearbeitungsmodus (z. B. „Rolle ändern“). */
  initialEditMode?: boolean;
  /** Scrollt nach Öffnen zu einer Sektion. */
  focusSection?: 'role' | 'scope' | 'permissions';
}

export function UserDetailDrawer({
  orgId,
  user,
  stations,
  stationNameById,
  open,
  onOpenChange,
  onUpdated,
  onError,
  onRemove,
  onPasswordReset,
  canWrite = true,
  canManage = true,
  initialEditMode = false,
  focusSection,
}: UserDetailDrawerProps) {
  const [security, setSecurity] = useState<UserSecurityActivityDto | null>(null);
  const [roles, setRoles] = useState<OrganizationRoleDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone);
  const [department, setDepartment] = useState(user.department);
  const [position, setPosition] = useState(user.position);
  const [organizationRoleId, setOrganizationRoleId] = useState(user.organizationRoleId ?? '');
  const [stationMode, setStationMode] = useState<'all' | 'selected'>(
    (user.stationIds?.length ?? 0) > 0 ? 'selected' : 'all',
  );
  const [stationIds, setStationIds] = useState<string[]>(user.stationIds ?? []);
  const [fieldAgentAccess, setFieldAgentAccess] = useState(user.fieldAgentAccess);
  const [permissions, setPermissions] = useState<MembershipPermissionsMap>(
    user.permissions ?? {},
  );

  useEffect(() => {
    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email);
    setPhone(user.phone);
    setDepartment(user.department);
    setPosition(user.position);
    setOrganizationRoleId(user.organizationRoleId ?? '');
    setStationIds(user.stationIds ?? []);
    setStationMode((user.stationIds?.length ?? 0) > 0 ? 'selected' : 'all');
    setFieldAgentAccess(user.fieldAgentAccess);
    setPermissions(user.permissions ?? {});
  }, [user]);

  useEffect(() => {
    if (!open) {
      setEditMode(false);
      return;
    }
    if (initialEditMode) setEditMode(true);
    if (focusSection) {
      requestAnimationFrame(() => {
        document.getElementById(`user-drawer-${focusSection}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }, [open, user.id, initialEditMode, focusSection]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const [sec, roleList] = await Promise.all([
          api.users.securityActivity(orgId, user.id),
          api.organizationRoles.list(orgId),
        ]);
        setSecurity(sec);
        setRoles(Array.isArray(roleList) ? roleList : []);
      } catch {
        setSecurity(null);
      }
    })();
  }, [open, orgId, user.id]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === organizationRoleId) ?? null,
    [roles, organizationRoleId],
  );

  const previewPermissions = useMemo(() => {
    if (selectedRole) return permissionsFromRoleTemplate(selectedRole);
    return permissions;
  }, [selectedRole, permissions]);

  const permissionWarnings = useMemo(
    () => describePermissionChange(user.permissions, previewPermissions),
    [user.permissions, previewPermissions],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const stationScope =
        stationMode === 'all'
          ? undefined
          : stations.find((s) => s.id === stationIds[0])?.name ?? user.stationScope;
      await api.users.updateByOrg(orgId, user.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        department: department.trim() || undefined,
        position: position.trim() || undefined,
        stationScope,
        stationIds: stationMode === 'selected' ? stationIds : [],
        fieldAgentAccess,
        permissions: user.roleKey === 'ORG_ADMIN' ? undefined : permissions,
      });
      if (organizationRoleId && organizationRoleId !== user.organizationRoleId) {
        await api.users.assignRole(orgId, user.id, organizationRoleId);
      }
      setEditMode(false);
      await onUpdated();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  const timelineItems = (security?.auditTimeline ?? []).map((row) => {
    const tone: StatusTone = row.level === 'CRITICAL' ? 'critical' : 'neutral';
    return {
      id: row.id,
      title: row.auditAction
        ? AUDIT_ACTION_LABELS[row.auditAction] ?? row.description
        : row.description,
      time: formatDateTime(row.createdAt),
      tone,
    };
  });

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-xl"
      eyebrow="Benutzerprofil"
      title={user.name || user.email}
      description={user.email}
      status={<UserStatusBadge status={user.status} />}
      footer={
        editMode ? (
          <>
            <button type="button" className="sq-3d-btn text-xs" onClick={() => setEditMode(false)}>
              Abbrechen
            </button>
            <button
              type="button"
              className="sq-3d-btn sq-3d-btn--primary text-xs"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              Speichern
            </button>
          </>
        ) : (
          <>
            {canManage && (
              <button type="button" className="sq-3d-btn text-xs" onClick={onPasswordReset}>
                <Key className="w-3.5 h-3.5 inline mr-1" />
                Passwort
              </button>
            )}
            {canWrite && (
              <button type="button" className="sq-3d-btn text-xs" onClick={() => setEditMode(true)}>
                Bearbeiten
              </button>
            )}
            {canManage && (
              <button type="button" className="sq-3d-btn text-xs text-red-600" onClick={onRemove}>
                <Trash2 className="w-3.5 h-3.5 inline mr-1" />
                Entfernen
              </button>
            )}
          </>
        )
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-sm font-bold">
            {user.avatar || getInitials(user.name, user.email)}
          </div>
          <div>
            <p className="text-[14px] font-semibold">{userDisplayRole(user)}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              <AdminBadge user={user} />
            </div>
          </div>
        </div>

        <section>
          <SectionHeader title="Profil" />
          {editMode ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <Input label="Vorname" value={firstName} onChange={setFirstName} />
              <Input label="Nachname" value={lastName} onChange={setLastName} />
              <div className="sm:col-span-2">
                <Input label="E-Mail" value={email} onChange={setEmail} />
              </div>
              <Input label="Telefon" value={phone} onChange={setPhone} />
              <Input label="Abteilung" value={department} onChange={setDepartment} />
              <Input label="Position" value={position} onChange={setPosition} />
            </div>
          ) : (
            <div className="mt-2 space-y-2 text-[13px]">
              <Info icon={Mail} label="E-Mail" value={user.email} />
              <Info icon={Phone} label="Telefon" value={user.phone || '—'} />
              <Info icon={MapPin} label="Abteilung" value={user.department || '—'} />
            </div>
          )}
        </section>

        <section id="user-drawer-role">
          <SectionHeader title="Zugriff & Rollen" />
          {editMode ? (
            <div className="mt-2 space-y-2">
              <label className="block text-[11px] font-semibold text-muted-foreground">Rollenvorlage</label>
              <select
                value={organizationRoleId}
                onChange={(e) => {
                  const id = e.target.value;
                  setOrganizationRoleId(id);
                  const role = roles.find((r) => r.id === id);
                  if (role) {
                    setPermissions(permissionsFromRoleTemplate(role));
                    setFieldAgentAccess(role.fieldAgentAccessDefault);
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-border surface-premium text-[13px]"
              >
                <option value="">— Keine Vorlage —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {permissionWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-800 dark:text-amber-200">
                  {permissionWarnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-[13px] space-y-1">
              <Info icon={Shield} label="Rolle" value={userDisplayRole(user)} />
              <Info icon={Smartphone} label="Field Agent" value={user.fieldAgentAccess ? 'Aktiv' : 'Inaktiv'} />
            </div>
          )}
        </section>

        <section id="user-drawer-scope">
          <SectionHeader title="Stationen / Zugriff" />
          {editMode ? (
            <div className="mt-2 space-y-2">
              <select
                value={stationMode}
                onChange={(e) => setStationMode(e.target.value as 'all' | 'selected')}
                className="w-full px-3 py-2 rounded-xl border border-border text-[13px]"
              >
                <option value="all">Alle Stationen</option>
                <option value="selected">Ausgewählte Stationen</option>
              </select>
              {stationMode === 'selected' && (
                <div className="max-h-36 overflow-y-auto border border-border rounded-xl p-2 space-y-1">
                  {stations.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-[12px]">
                      <input
                        type="checkbox"
                        checked={stationIds.includes(s.id)}
                        onChange={() => {
                          setStationIds((prev) =>
                            prev.includes(s.id)
                              ? prev.filter((id) => id !== s.id)
                              : [...prev, s.id],
                          );
                        }}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-foreground">
              {userStationLabel(user, stationNameById)}
            </p>
          )}
        </section>

        <section id="user-drawer-permissions">
          <SectionHeader title="Berechtigungen" />
          <div className="mt-2">
            <PermissionPreview
              permissions={previewPermissions}
              title="Dieser Benutzer darf …"
            />
            {editMode && user.roleKey !== 'ORG_ADMIN' && (
              <div className="mt-3">
                <CollapsiblePermissions permissions={permissions} onChange={setPermissions} />
              </div>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Sicherheit" />
          <div className="mt-2 text-[13px] space-y-1">
            <p>
              <span className="text-muted-foreground">Letzter Login: </span>
              {formatDateTime(security?.lastLoginAt ?? user.lastLoginAt)}
            </p>
            <p>
              <span className="text-muted-foreground">Einladungsstatus: </span>
              {formatInviteStatus(security?.inviteStatus)}
            </p>
            <p>
              <span className="text-muted-foreground">2FA: </span>
              {security?.twoFactorEnabled == null ? 'Nicht verfügbar' : security.twoFactorEnabled ? 'Aktiv' : 'Inaktiv'}
            </p>
            <p>
              <span className="text-muted-foreground">Aktive Sitzungen: </span>
              {security?.activeSessionCount == null ? '—' : security.activeSessionCount}
            </p>
            {user.mustChangePassword && (
              <p className="text-amber-600 text-[12px]">Passwortänderung beim nächsten Login erforderlich</p>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="Aktivität" />
          <div className="mt-2">
            {timelineItems.length ? (
              <Timeline items={timelineItems} />
            ) : (
              <p className="text-[12px] text-muted-foreground">Keine Audit-Einträge für diesen Benutzer.</p>
            )}
          </div>
        </section>
      </div>
    </DetailDrawer>
  );
}

function Info({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px]"
      />
    </label>
  );
}
