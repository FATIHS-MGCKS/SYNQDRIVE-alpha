import { Loader2, Pencil, X } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { DataCard } from '../../../../components/patterns';
import { formatAccountDate, type ProfileDraft } from './account-utils';

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-border/70 bg-card text-xs text-foreground placeholder:text-muted-foreground transition-all outline-none focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand-soft)]';
const labelClass = 'block text-[11px] font-semibold mb-1.5 text-muted-foreground';

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-2.5 border-b border-border/40 last:border-0">
      <dt className="text-[11px] font-semibold text-muted-foreground sm:w-36 shrink-0">{label}</dt>
      <dd className="text-xs text-foreground flex-1">{value || '—'}</dd>
    </div>
  );
}

interface AccountProfileSectionProps {
  account: AccountMeDto;
  editing: boolean;
  draft: ProfileDraft;
  saved: ProfileDraft;
  dirty: boolean;
  saving: boolean;
  validationError: string | null;
  onDraftChange: (patch: Partial<ProfileDraft>) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function AccountProfileSection({
  account,
  editing,
  draft,
  dirty,
  saving,
  validationError,
  onDraftChange,
  onStartEdit,
  onCancel,
  onSave,
}: AccountProfileSectionProps) {
  const { user, membership, organization } = account;

  return (
    <div id="account-section-profile">
    <DataCard
      title="Profil"
      description="Persönliche Kontaktdaten — Rolle und Organisation sind schreibgeschützt."
      actions={
        !editing ? (
          <button
            type="button"
            onClick={onStartEdit}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border/60 hover:bg-muted transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Bearbeiten
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-muted"
            >
              <X className="w-3.5 h-3.5" />
              Abbrechen
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Speichern
            </button>
          </div>
        )
      }
    >
      {validationError && (
        <p className="mb-3 text-xs text-[color:var(--status-critical)]">{validationError}</p>
      )}

      {editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Vorname</label>
            <input
              className={inputClass}
              value={draft.firstName}
              onChange={(e) => onDraftChange({ firstName: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Nachname</label>
            <input
              className={inputClass}
              value={draft.lastName}
              onChange={(e) => onDraftChange({ lastName: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass}>Telefon</label>
            <input
              className={inputClass}
              value={draft.phone}
              onChange={(e) => onDraftChange({ phone: e.target.value })}
              placeholder="+49 …"
            />
          </div>
          <div>
            <label className={labelClass}>Mobilnummer</label>
            <input
              className={inputClass}
              value={draft.mobile}
              onChange={(e) => onDraftChange({ mobile: e.target.value })}
              placeholder="+49 …"
            />
          </div>
        </div>
      ) : (
        <dl>
          <KeyValueRow label="Vorname" value={user.firstName ?? ''} />
          <KeyValueRow label="Nachname" value={user.lastName ?? ''} />
          <KeyValueRow label="E-Mail" value={user.email} />
          <KeyValueRow label="Telefon" value={user.phone ?? ''} />
          <KeyValueRow label="Mobilnummer" value={user.mobile ?? ''} />
          <KeyValueRow label="Erstellt am" value={formatAccountDate(user.createdAt)} />
          <KeyValueRow label="Letzte Änderung" value={formatAccountDate(user.updatedAt)} />
        </dl>
      )}

      <div className="mt-4 pt-4 border-t border-border/50">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
          Organisationskontext (schreibgeschützt)
        </p>
        <dl>
          <KeyValueRow label="Organisation" value={organization.name} />
          <KeyValueRow label="Rolle" value={membership.roleLabel ?? membership.role} />
          <KeyValueRow label="Abteilung" value={membership.department ?? ''} />
          <KeyValueRow label="Position" value={membership.position ?? ''} />
          <KeyValueRow label="Station Scope" value={membership.stationScope ?? ''} />
        </dl>
      </div>
    </DataCard>
    </div>
  );
}
