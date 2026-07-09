import { Check, ChevronLeft, ChevronRight, Copy, Key, Mail, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  api,
  type MembershipPermissionsMap,
  type OrganizationRoleDto,
  type Station,
} from '../../../lib/api';
import { permissionsFromRoleTemplate } from './constants';
import { PermissionPreview } from './PermissionEditor';
import type { CreateUserFormState, WizardStep } from './types';
import { generatePassword, isValidEmail } from './utils';

const STEPS: WizardStep[] = ['person', 'role', 'access', 'invite', 'summary'];
const STEP_LABELS: Record<WizardStep, string> = {
  person: 'Person',
  role: 'Rolle',
  access: 'Zugriff',
  invite: 'Einladung',
  summary: 'Zusammenfassung',
};

const EMPTY_FORM: CreateUserFormState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  department: '',
  position: '',
  organizationRoleId: '',
  stationMode: 'all',
  stationIds: [],
  fieldAgentAccess: false,
  accountMethod: 'invite',
  password: '',
};

interface CreateUserWizardProps {
  orgId: string;
  stations: Station[];
  onClose: () => void;
  onDone: () => void;
  onError: (err: unknown) => void;
}

export function CreateUserWizard({ orgId, stations, onClose, onDone, onError }: CreateUserWizardProps) {
  const [step, setStep] = useState<WizardStep>('person');
  const [form, setForm] = useState<CreateUserFormState>({ ...EMPTY_FORM, password: generatePassword() });
  const [roles, setRoles] = useState<OrganizationRoleDto[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void (async () => {
      setRolesLoading(true);
      try {
        const list = await api.organizationRoles.list(orgId);
        setRoles(Array.isArray(list) ? list : []);
        setRolesError(null);
      } catch (err) {
        setRoles([]);
        setRolesError(err instanceof Error ? err.message : 'Rollen konnten nicht geladen werden.');
      } finally {
        setRolesLoading(false);
      }
    })();
  }, [orgId]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === form.organizationRoleId) ?? null,
    [roles, form.organizationRoleId],
  );

  const previewPermissions = useMemo((): MembershipPermissionsMap | null => {
    if (!selectedRole) return null;
    return permissionsFromRoleTemplate(selectedRole);
  }, [selectedRole]);

  const stepIndex = STEPS.indexOf(step);

  const patch = (partial: Partial<CreateUserFormState>) =>
    setForm((prev) => ({ ...prev, ...partial }));

  const canNext = (() => {
    if (step === 'person') {
      return Boolean(
        form.firstName.trim() &&
          form.lastName.trim() &&
          form.email.trim() &&
          isValidEmail(form.email),
      );
    }
    if (step === 'role') return Boolean(form.organizationRoleId);
    if (step === 'access' && form.stationMode === 'selected') {
      return form.stationIds.length > 0;
    }
    return true;
  })();

  const handleSelectRole = (role: OrganizationRoleDto) => {
    patch({
      organizationRoleId: role.id,
      fieldAgentAccess: role.fieldAgentAccessDefault,
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const stationScope =
        form.stationMode === 'all'
          ? undefined
          : stations.find((s) => s.id === form.stationIds[0])?.name;
      const stationIds = form.stationMode === 'selected' ? form.stationIds : undefined;

      if (form.accountMethod === 'invite') {
        await api.organizationInvites.create(orgId, {
          email: form.email.trim(),
          organizationRoleId: form.organizationRoleId,
          membershipRole: selectedRole?.membershipRole,
          permissions: previewPermissions ?? undefined,
          stationScope,
          stationIds,
          fieldAgentAccess: form.fieldAgentAccess,
          department: form.department.trim() || undefined,
          position: form.position.trim() || undefined,
          roleLabel: selectedRole?.name,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
        });
      } else {
        await api.users.createByOrg(orgId, {
          email: form.email.trim(),
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          role: selectedRole?.membershipRole ?? 'WORKER',
          organizationRoleId: form.organizationRoleId,
          password: form.password,
          phone: form.phone.trim() || undefined,
          department: form.department.trim() || undefined,
          position: form.position.trim() || undefined,
          roleLabel: selectedRole?.name,
          stationScope,
          stationIds,
          permissions: selectedRole?.membershipRole === 'ORG_ADMIN' ? undefined : previewPermissions ?? undefined,
          fieldAgentAccess: form.fieldAgentAccess,
        });
      }
      onDone();
    } catch (err) {
      onError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] overlay-scrim flex items-center justify-center p-4">
      <div className="sq-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-[var(--shadow-2)] p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-[16px] font-semibold text-foreground">Benutzer einladen</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Schritt {stepIndex + 1} von {STEPS.length} — {STEP_LABELS[step]}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 mb-5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                  i < stepIndex
                    ? 'bg-emerald-500 text-white'
                    : i === stepIndex
                      ? 'bg-[var(--brand)] text-[var(--brand-foreground)] ring-4 ring-[var(--brand-soft)]'
                      : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 rounded ${i < stepIndex ? 'bg-emerald-500' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {step === 'person' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vorname *" value={form.firstName} onChange={(v) => patch({ firstName: v })} />
            <Field label="Nachname *" value={form.lastName} onChange={(v) => patch({ lastName: v })} />
            <div className="sm:col-span-2">
              <Field label="E-Mail *" value={form.email} onChange={(v) => patch({ email: v })} type="email" />
            </div>
            <Field label="Telefon" value={form.phone} onChange={(v) => patch({ phone: v })} />
            <Field label="Abteilung" value={form.department} onChange={(v) => patch({ department: v })} />
            <Field label="Position" value={form.position} onChange={(v) => patch({ position: v })} />
          </div>
        )}

        {step === 'role' && (
          <div className="space-y-3">
            {rolesLoading ? (
              <p className="text-[13px] text-muted-foreground">Rollen werden geladen…</p>
            ) : roles.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Keine Rollenvorlagen verfügbar.</p>
            ) : (
              roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleSelectRole(role)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    form.organizationRoleId === role.id
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)]'
                      : 'border-border hover:border-border/80 hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-semibold text-foreground">{role.name}</p>
                      {role.description && (
                        <p className="text-[12px] text-muted-foreground mt-1">{role.description}</p>
                      )}
                    </div>
                    {role.isSystemTemplate && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        System
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
            {previewPermissions && (
              <PermissionPreview permissions={previewPermissions} title="Vorschau für diese Rolle" />
            )}
          </div>
        )}

        {step === 'access' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => patch({ stationMode: 'all', stationIds: [] })}
                className={`p-3 rounded-xl border text-left ${form.stationMode === 'all' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border'}`}
              >
                <p className="text-[13px] font-semibold">Alle Stationen</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Organisationsweiter Zugriff</p>
              </button>
              <button
                type="button"
                onClick={() => patch({ stationMode: 'selected' })}
                className={`p-3 rounded-xl border text-left ${form.stationMode === 'selected' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border'}`}
              >
                <p className="text-[13px] font-semibold">Ausgewählte Stationen</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Zugriff auf bestimmte Standorte</p>
              </button>
            </div>
            {form.stationMode === 'selected' && (
              <div className="rounded-xl border border-border p-3 max-h-48 overflow-y-auto space-y-1">
                {stations.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">Keine Stationen konfiguriert.</p>
                ) : (
                  stations.map((s) => {
                    const checked = form.stationIds.includes(s.id);
                    return (
                      <label key={s.id} className="flex items-center gap-2 py-1.5 text-[13px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? form.stationIds.filter((id) => id !== s.id)
                              : [...form.stationIds, s.id];
                            patch({ stationIds: next });
                          }}
                        />
                        {s.name}
                      </label>
                    );
                  })
                )}
              </div>
            )}
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border">
              <div>
                <p className="text-[13px] font-semibold">Field Agent / Übergabe</p>
                <p className="text-[11px] text-muted-foreground">Mobiler Zugriff für Übergabeprozesse</p>
              </div>
              <input
                type="checkbox"
                checked={form.fieldAgentAccess}
                onChange={(e) => patch({ fieldAgentAccess: e.target.checked })}
              />
            </label>
          </div>
        )}

        {step === 'invite' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => patch({ accountMethod: 'invite' })}
                className={`p-4 rounded-xl border text-left ${form.accountMethod === 'invite' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border'}`}
              >
                <Mail className="w-5 h-5 mb-2 text-[var(--brand)]" />
                <p className="text-[13px] font-semibold">Einladung per E-Mail</p>
                <p className="text-[11px] text-muted-foreground mt-1">Empfohlen — sicherer Onboarding-Flow</p>
              </button>
              <button
                type="button"
                onClick={() => patch({ accountMethod: 'password', password: generatePassword() })}
                className={`p-4 rounded-xl border text-left ${form.accountMethod === 'password' ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-border'}`}
              >
                <Key className="w-5 h-5 mb-2 text-muted-foreground" />
                <p className="text-[13px] font-semibold">Passwort manuell setzen</p>
                <p className="text-[11px] text-muted-foreground mt-1">Erweitert — nur bei Bedarf</p>
              </button>
            </div>
            {form.accountMethod === 'password' && (
              <div className="rounded-xl border border-border p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Einmal-Passwort
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 rounded-lg bg-muted text-[12px] font-mono">{form.password}</code>
                  <button
                    type="button"
                    className="p-2 rounded-lg border border-border hover:bg-muted/50"
                    onClick={() => {
                      void navigator.clipboard.writeText(form.password);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-lg border border-border hover:bg-muted/50"
                    onClick={() => patch({ password: generatePassword() })}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[11px] text-amber-600 mt-2">
                  Der Benutzer muss dieses Passwort beim ersten Login ändern.
                </p>
              </div>
            )}
          </div>
        )}

        {step === 'summary' && (
          <div className="rounded-xl border border-border p-4 space-y-2 text-[13px]">
            <Row label="Name" value={`${form.firstName} ${form.lastName}`} />
            <Row label="E-Mail" value={form.email} />
            <Row label="Rolle" value={selectedRole?.name ?? '—'} />
            <Row
              label="Stationen"
              value={
                form.stationMode === 'all'
                  ? 'Alle Stationen'
                  : `${form.stationIds.length} ausgewählt`
              }
            />
            <Row label="Field Agent" value={form.fieldAgentAccess ? 'Ja' : 'Nein'} />
            <Row
              label="Vorgehen"
              value={form.accountMethod === 'invite' ? 'Einladung senden' : 'Benutzer mit Passwort erstellen'}
            />
          </div>
        )}

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/60">
          <button
            type="button"
            className="sq-3d-btn text-xs flex items-center gap-1"
            onClick={() => (stepIndex > 0 ? setStep(STEPS[stepIndex - 1]) : onClose())}
          >
            <ChevronLeft className="w-4 h-4" />
            {stepIndex > 0 ? 'Zurück' : 'Abbrechen'}
          </button>
          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext}
              className="sq-3d-btn sq-3d-btn--primary text-xs flex items-center gap-1 disabled:opacity-50"
              onClick={() => setStep(STEPS[stepIndex + 1])}
            >
              Weiter <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              className="sq-3d-btn sq-3d-btn--primary text-xs"
              onClick={() => void handleSubmit()}
            >
              {form.accountMethod === 'invite' ? 'Einladung senden' : 'Benutzer erstellen'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 block">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-[13px] outline-none focus:ring-2 focus:ring-[var(--brand-soft)]"
      />
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}
