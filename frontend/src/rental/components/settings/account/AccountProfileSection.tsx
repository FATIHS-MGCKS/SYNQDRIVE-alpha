import { Loader2, Pencil } from 'lucide-react';
import type { AccountMeDto } from '../../../../lib/api';
import { DataCard, SectionHeader } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { accountFieldLabelClass, accountInputClass } from './account-ui';
import { formatAccountDate, type ProfileDraft } from './account-utils';

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/40 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-[11px] font-medium text-muted-foreground sm:w-32">{label}</dt>
      <dd className="flex-1 text-xs text-foreground">{value || '—'}</dd>
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
            <Button type="button" variant="outline" size="sm" onClick={onStartEdit}>
              <Pencil />
              Bearbeiten
            </Button>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
                Abbrechen
              </Button>
              <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>
                {saving ? <Loader2 className="animate-spin" /> : null}
                Speichern
              </Button>
            </div>
          )
        }
      >
        {validationError ? (
          <p className="mb-3 text-xs text-[color:var(--status-critical)]">{validationError}</p>
        ) : null}

        {editing ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={accountFieldLabelClass}>Vorname</label>
              <input
                className={accountInputClass}
                value={draft.firstName}
                onChange={(e) => onDraftChange({ firstName: e.target.value })}
              />
            </div>
            <div>
              <label className={accountFieldLabelClass}>Nachname</label>
              <input
                className={accountInputClass}
                value={draft.lastName}
                onChange={(e) => onDraftChange({ lastName: e.target.value })}
              />
            </div>
            <div>
              <label className={accountFieldLabelClass}>Telefon</label>
              <input
                className={accountInputClass}
                value={draft.phone}
                onChange={(e) => onDraftChange({ phone: e.target.value })}
                placeholder="+49 …"
              />
            </div>
            <div>
              <label className={accountFieldLabelClass}>Mobilnummer</label>
              <input
                className={accountInputClass}
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

        <div className="mt-4 border-t border-border/50 pt-4">
          <SectionHeader
            as="label"
            title="Organisationskontext"
            description="Schreibgeschützt — Änderungen über Benutzer & Rollen."
            className="mb-2"
          />
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
