import { Loader2 } from 'lucide-react';
import { DataCard } from '../../../../components/patterns';
import {
  applyNotificationPreset,
  canToggleNotificationChannel,
  NOTIFICATION_CHANNELS,
  type NotificationPresetId,
  type NotificationRow,
} from './account-utils';

const PRESETS: Array<{ id: NotificationPresetId; label: string }> = [
  { id: 'org_admin_full', label: 'Org Admin vollständig' },
  { id: 'critical_only', label: 'Nur kritische Alerts' },
  { id: 'operational', label: 'Operativer Mitarbeiter' },
  { id: 'quiet_except_security', label: 'Alles außer Security aus' },
];

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-40 ${
        checked ? 'bg-[var(--brand)]' : 'bg-muted'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

interface AccountNotificationsSectionProps {
  draft: NotificationRow[];
  dirty: boolean;
  saving: boolean;
  onDraftChange: (rows: NotificationRow[]) => void;
  onSave: () => void;
  onReset: () => void;
}

export function AccountNotificationsSection({
  draft,
  dirty,
  saving,
  onDraftChange,
  onSave,
  onReset,
}: AccountNotificationsSectionProps) {
  const updateRow = (
    category: NotificationRow['category'],
    key: keyof NotificationRow,
    value: boolean,
  ) => {
    onDraftChange(
      draft.map((row) => {
        if (row.category !== category) return row;
        if (
          (key === 'inApp' || key === 'email') &&
          !canToggleNotificationChannel(row.category, key, row, value)
        ) {
          return row;
        }
        return { ...row, [key]: value };
      }),
    );
  };

  return (
    <div id="account-section-notifications">
    <DataCard
      title="Benachrichtigungen"
      description="Kategorien und Kanäle — Security-Benachrichtigungen benötigen mindestens In-App oder E-Mail."
      actions={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty || saving}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            Zurücksetzen
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
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onDraftChange(applyNotificationPreset(draft, preset.id))}
            className="px-2.5 py-1 rounded-lg text-[10px] font-semibold border border-border/60 hover:bg-muted transition-colors"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Desktop matrix */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border/60">
              <th className="py-2 pr-4 text-[10px] font-semibold text-muted-foreground uppercase">
                Kategorie
              </th>
              {NOTIFICATION_CHANNELS.map((ch) => (
                <th
                  key={ch.key}
                  className="py-2 px-2 text-center text-[10px] font-semibold text-muted-foreground uppercase w-16"
                >
                  {ch.short}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.map((row) => (
              <tr key={row.category} className="border-b border-border/40 hover:bg-muted/20">
                <td className="py-3 pr-4">
                  <p className="text-xs font-medium text-foreground">{row.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 max-w-xs">{row.description}</p>
                </td>
                {NOTIFICATION_CHANNELS.map((ch) => {
                  const key = ch.key;
                  const val = row[key] as boolean;
                  const disabled =
                    row.category === 'SECURITY' &&
                    (key === 'inApp' || key === 'email') &&
                    !canToggleNotificationChannel(row.category, key, row, !val);
                  return (
                    <td key={key} className="py-3 px-2 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={val}
                          disabled={disabled}
                          onChange={() => updateRow(row.category, key, !val)}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <div className="lg:hidden space-y-3">
        {draft.map((row) => (
          <div key={row.category} className="rounded-xl border border-border/60 p-3 bg-muted/20">
            <p className="text-xs font-medium text-foreground">{row.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 mb-3">{row.description}</p>
            <div className="space-y-2">
              {NOTIFICATION_CHANNELS.map((ch) => {
                const key = ch.key;
                const val = row[key] as boolean;
                const disabled =
                  row.category === 'SECURITY' &&
                  (key === 'inApp' || key === 'email') &&
                  !canToggleNotificationChannel(row.category, key, row, !val);
                return (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">{ch.label}</span>
                    <Toggle
                      checked={val}
                      disabled={disabled}
                      onChange={() => updateRow(row.category, key, !val)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DataCard>
    </div>
  );
}
