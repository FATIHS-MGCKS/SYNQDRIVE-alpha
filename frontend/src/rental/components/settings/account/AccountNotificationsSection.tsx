import { Loader2 } from 'lucide-react';
import { DataCard } from '../../../../components/patterns';
import { Button } from '../../../../components/ui/button';
import { Switch } from '../../../../components/ui/switch';
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
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={!dirty || saving}
            >
              Zurücksetzen
            </Button>
            <Button type="button" size="sm" onClick={onSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        }
      >
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              className="!text-[10px]"
              onClick={() => onDraftChange(applyNotificationPreset(draft, preset.id))}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border/60">
                <th className="py-2 pr-4 text-[10px] font-semibold uppercase text-muted-foreground">
                  Kategorie
                </th>
                {NOTIFICATION_CHANNELS.map((ch) => (
                  <th
                    key={ch.key}
                    className="w-16 px-2 py-2 text-center text-[10px] font-semibold uppercase text-muted-foreground"
                  >
                    {ch.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {draft.map((row) => (
                <tr key={row.category} className="border-b border-border/40 hover:bg-muted/20">
                  <td className="py-2.5 pr-4">
                    <p className="text-xs font-medium text-foreground">{row.label}</p>
                    <p className="mt-0.5 max-w-xs text-[10px] text-muted-foreground">{row.description}</p>
                  </td>
                  {NOTIFICATION_CHANNELS.map((ch) => {
                    const key = ch.key;
                    const val = row[key] as boolean;
                    const disabled =
                      row.category === 'SECURITY' &&
                      (key === 'inApp' || key === 'email') &&
                      !canToggleNotificationChannel(row.category, key, row, !val);
                    return (
                      <td key={key} className="px-2 py-2.5 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={val}
                            disabled={disabled}
                            onCheckedChange={() => updateRow(row.category, key, !val)}
                            aria-label={`${row.label} ${ch.label}`}
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

        <div className="space-y-2 lg:hidden">
          {draft.map((row) => (
            <div key={row.category} className="rounded-xl border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-medium text-foreground">{row.label}</p>
              <p className="mb-2.5 mt-0.5 text-[10px] text-muted-foreground">{row.description}</p>
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
                      <Switch
                        checked={val}
                        disabled={disabled}
                        onCheckedChange={() => updateRow(row.category, key, !val)}
                        aria-label={`${row.label} ${ch.label}`}
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
