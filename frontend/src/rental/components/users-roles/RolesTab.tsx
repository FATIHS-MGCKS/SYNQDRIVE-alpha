import { Copy, Pencil, Plus, Shield, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  EmptyState,
  ErrorState,
  SectionHeader,
  SkeletonRows,
} from '../../../components/patterns';
import {
  api,
  type CreateOrganizationRolePayload,
  type MembershipPermissionsMap,
  type OrganizationRoleDto,
  type Station,
} from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { RoleTemplateBadge } from './badges';
import { MEMBERSHIP_ROLE_LABELS, permissionsFromRoleTemplate } from './constants';
import { PermissionEditor, PermissionPreview } from './PermissionEditor';

interface RolesTabProps {
  orgId: string;
  roles: OrganizationRoleDto[];
  stations: Station[];
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onNotifySuccess: (msg: string) => void;
  onNotifyError: (err: unknown, fallback: string) => void;
}

export function RolesTab({
  orgId,
  roles,
  stations,
  loading,
  error,
  onRefresh,
  onNotifySuccess,
  onNotifyError,
}: RolesTabProps) {
  const { hasPermission } = useRentalOrg();
  const canManage = hasPermission('users-roles', 'manage');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [membershipRole, setMembershipRole] = useState('WORKER');
  const [permissions, setPermissions] = useState<MembershipPermissionsMap>({});
  const [fieldAgentAccessDefault, setFieldAgentAccessDefault] = useState(false);
  const [stationScopeDefault, setStationScopeDefault] = useState('');

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    setName(selected.name);
    setDescription(selected.description ?? '');
    setMembershipRole(selected.membershipRole);
    setPermissions(permissionsFromRoleTemplate(selected));
    setFieldAgentAccessDefault(selected.fieldAgentAccessDefault);
    setStationScopeDefault(selected.stationScopeDefault ?? '');
  }, [selected]);

  const systemRoles = roles.filter((r) => r.isSystemTemplate);
  const customRoles = roles.filter((r) => !r.isSystemTemplate);

  const openCreate = () => {
    setSelectedId(null);
    setName('');
    setDescription('');
    setMembershipRole('WORKER');
    setPermissions({});
    setFieldAgentAccessDefault(false);
    setStationScopeDefault('');
    setEditorOpen(true);
  };

  const openEdit = (role: OrganizationRoleDto) => {
    setSelectedId(role.id);
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const payload: CreateOrganizationRolePayload = {
      name: name.trim(),
      description: description.trim() || undefined,
      membershipRole,
      permissions,
      fieldAgentAccessDefault,
      stationScopeDefault: stationScopeDefault || undefined,
    };
    try {
      if (selected) {
        await api.organizationRoles.update(orgId, selected.id, payload);
        onNotifySuccess('Rolle aktualisiert');
      } else {
        await api.organizationRoles.create(orgId, payload);
        onNotifySuccess('Rolle erstellt');
      }
      setEditorOpen(false);
      await onRefresh();
    } catch (err) {
      onNotifyError(err, 'Rolle konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (role: OrganizationRoleDto) => {
    try {
      await api.organizationRoles.duplicate(orgId, role.id);
      onNotifySuccess('Rolle dupliziert');
      await onRefresh();
    } catch (err) {
      onNotifyError(err, 'Duplizieren fehlgeschlagen.');
    }
  };

  const handleDelete = async (role: OrganizationRoleDto) => {
    if (role.isSystemTemplate) return;
    try {
      await api.organizationRoles.delete(orgId, role.id);
      onNotifySuccess('Rolle deaktiviert');
      if (selectedId === role.id) setEditorOpen(false);
      await onRefresh();
    } catch (err) {
      onNotifyError(err, 'Rolle konnte nicht gelöscht werden.');
    }
  };

  if (error && !roles.length) {
    return (
      <ErrorState
        title="Rollen nicht verfügbar"
        error={error}
        onRetry={() => void onRefresh()}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)] gap-4">
      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)] space-y-4">
        <SectionHeader
          title="Rollen"
          actions={
            canManage ? (
              <button type="button" className="sq-3d-btn sq-3d-btn--primary text-xs flex items-center gap-1" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" /> Neu
              </button>
            ) : undefined
          }
        />

        {loading ? (
          <SkeletonRows rows={6} />
        ) : (
          <>
            <RoleGroup
              title="Systemvorlagen"
              roles={systemRoles}
              selectedId={selectedId}
              onSelect={(r) => { setSelectedId(r.id); setEditorOpen(true); }}
            />
            <RoleGroup
              title="Eigene Rollen"
              roles={customRoles}
              selectedId={selectedId}
              onSelect={openEdit}
              emptyText="Noch keine eigenen Rollen erstellt."
            />
          </>
        )}
      </div>

      <div className="sq-card rounded-2xl p-4 shadow-[var(--shadow-1)]">
        {!editorOpen && !selected ? (
          <EmptyState
            icon={<Shield className="w-5 h-5" />}
            title="Rolle auswählen"
            description="Wählen Sie links eine Rolle oder erstellen Sie eine neue Rollenvorlage."
            compact
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[15px] font-semibold text-foreground">
                  {selected ? selected.name : 'Neue Rolle'}
                </h3>
                {selected?.isSystemTemplate && <div className="mt-1"><RoleTemplateBadge isSystem={true} /></div>}
              </div>
              {selected && canManage && (
                <div className="flex gap-1">
                  <button type="button" className="p-2 rounded-lg hover:bg-muted/50" onClick={() => void handleDuplicate(selected)}>
                    <Copy className="w-4 h-4" />
                  </button>
                  {!selected.isSystemTemplate && (
                    <button type="button" className="p-2 rounded-lg hover:bg-muted/50 text-red-600" onClick={() => void handleDelete(selected)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block md:col-span-2">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={selected?.isSystemTemplate}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px] disabled:opacity-60"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Beschreibung</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={selected?.isSystemTemplate}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px] disabled:opacity-60"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Basis-Membership</span>
                <select
                  value={membershipRole}
                  onChange={(e) => setMembershipRole(e.target.value)}
                  disabled={selected?.isSystemTemplate}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px]"
                >
                  {Object.entries(MEMBERSHIP_ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase text-muted-foreground">Standard-Station</span>
                <select
                  value={stationScopeDefault}
                  onChange={(e) => setStationScopeDefault(e.target.value)}
                  disabled={selected?.isSystemTemplate}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-border text-[13px]"
                >
                  <option value="">Alle Stationen</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={fieldAgentAccessDefault}
                onChange={(e) => setFieldAgentAccessDefault(e.target.checked)}
                disabled={selected?.isSystemTemplate}
              />
              Field Agent Standardzugriff
            </label>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PermissionEditor
                permissions={permissions}
                onChange={setPermissions}
                disabled={selected?.isSystemTemplate}
              />
              <PermissionPreview permissions={permissions} title="Vorschau" />
            </div>

            {!selected?.isSystemTemplate && canManage && (
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={saving}
                  className="sq-3d-btn sq-3d-btn--primary text-xs flex items-center gap-1"
                  onClick={() => void handleSave()}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {selected ? 'Speichern' : 'Rolle erstellen'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RoleGroup({
  title,
  roles,
  selectedId,
  onSelect,
  emptyText,
}: {
  title: string;
  roles: OrganizationRoleDto[];
  selectedId: string | null;
  onSelect: (role: OrganizationRoleDto) => void;
  emptyText?: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
      {roles.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{emptyText ?? 'Keine Einträge.'}</p>
      ) : (
        <div className="space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => onSelect(role)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                selectedId === role.id
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                  : 'border-transparent hover:bg-muted/40'
              }`}
            >
              <p className="text-[13px] font-medium text-foreground">{role.name}</p>
              {role.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-1">{role.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
