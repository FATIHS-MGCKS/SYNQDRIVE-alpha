import { Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { DataCard, StatusChip } from '../../../../components/patterns';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../../components/ui/accordion';
import { Button } from '../../../../components/ui/button';
import { Switch } from '../../../../components/ui/switch';
import { cn } from '../../../../components/ui/utils';
import {
  applyNotificationPreset,
  canToggleNotificationChannel,
  countEnabledNotificationChannels,
  NOTIFICATION_CHANNELS,
  securityChannelBlockMessage,
  SECURITY_CHANNEL_REQUIRED_MESSAGE,
  type NotificationPresetId,
  type NotificationRow,
} from './account-utils';

const PRESETS: Array<{ id: NotificationPresetId; label: string }> = [
  { id: 'org_admin_full', label: 'Org Admin vollständig' },
  { id: 'critical_only', label: 'Nur kritische Alerts' },
  { id: 'operational', label: 'Operativer Mitarbeiter' },
  { id: 'quiet_except_security', label: 'Alles außer Security aus' },
];

const NOTIFICATION_SWITCH_CLASS =
  'h-6 w-11 shrink-0 data-[state=checked]:bg-[color:var(--brand)] data-[state=unchecked]:bg-muted/80 [&_[data-slot=switch-thumb]]:size-5';

interface AccountNotificationsSectionProps {
  draft: NotificationRow[];
  dirty: boolean;
  saving: boolean;
  onDraftChange: (rows: NotificationRow[]) => void;
  onSave: () => void;
  onReset: () => void;
}

function NotificationChannelSwitch({
  row,
  channelKey,
  channelLabel,
  onBlocked,
  onToggle,
}: {
  row: NotificationRow;
  channelKey: (typeof NOTIFICATION_CHANNELS)[number]['key'];
  channelLabel: string;
  onBlocked: (message: string) => void;
  onToggle: (category: NotificationRow['category'], key: keyof NotificationRow, value: boolean) => void;
}) {
  const value = row[channelKey] as boolean;
  const disabled =
    row.category === 'SECURITY' &&
    (channelKey === 'inApp' || channelKey === 'email') &&
    !canToggleNotificationChannel(row.category, channelKey, row, !value);

  return (
    <Switch
      checked={value}
      disabled={disabled}
      className={NOTIFICATION_SWITCH_CLASS}
      onCheckedChange={(checked) => {
        const blockMessage = securityChannelBlockMessage(
          row.category,
          channelKey,
          row,
          checked,
        );
        if (blockMessage) {
          onBlocked(blockMessage);
          return;
        }
        onToggle(row.category, channelKey, checked);
      }}
      aria-label={`${row.label} ${channelLabel}`}
    />
  );
}

function NotificationRowSummary({ row }: { row: NotificationRow }) {
  const activeChannels = countEnabledNotificationChannels(row);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 text-left">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-foreground">{row.label}</p>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {row.criticalOnly ? (
            <StatusChip tone="warning" className="!text-[9px] !px-1.5 !py-0">
              Nur kritisch
            </StatusChip>
          ) : null}
        </div>
      </div>
      <p className="line-clamp-2 text-[10px] leading-snug text-muted-foreground">{row.description}</p>
      <p className="text-[10px] font-medium text-muted-foreground">
        {activeChannels} Kanal{activeChannels === 1 ? '' : 'e'} aktiv
      </p>
    </div>
  );
}

export function AccountNotificationsSection({
  draft,
  dirty,
  saving,
  onDraftChange,
  onSave,
  onReset,
}: AccountNotificationsSectionProps) {
  const [securityHint, setSecurityHint] = useState<string | null>(null);

  const updateRow = useCallback(
    (category: NotificationRow['category'], key: keyof NotificationRow, value: boolean) => {
      setSecurityHint(null);
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
    },
    [draft, onDraftChange],
  );

  const handleBlocked = useCallback((message: string) => {
    setSecurityHint(message);
  }, []);

  return (
    <div id="account-section-notifications">
      <DataCard
        title="Benachrichtigungen"
        description="Kategorien und Kanäle — Security-Benachrichtigungen benötigen mindestens In-App oder E-Mail."
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5 sm:w-auto">
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
              className="!text-[11px]"
              onClick={() => {
                setSecurityHint(null);
                onDraftChange(applyNotificationPreset(draft, preset.id));
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {securityHint ? (
          <p
            className="mb-3 rounded-lg border border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch-soft)]/40 px-3 py-2 text-[11px] text-foreground"
            role="status"
          >
            {securityHint}
          </p>
        ) : null}

        {/* Desktop matrix */}
        <div className="hidden overflow-x-auto lg:block">
          <div className="overflow-hidden rounded-xl border border-border/60">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-border/60 bg-muted/25">
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Kategorie
                  </th>
                  {NOTIFICATION_CHANNELS.map((ch) => (
                    <th
                      key={ch.key}
                      className="w-[4.5rem] px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {ch.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draft.map((row) => (
                  <tr
                    key={row.category}
                    className={cn(
                      'border-b border-border/40 last:border-b-0 hover:bg-muted/15',
                      row.category === 'SECURITY' && securityHint && 'bg-[color:var(--status-watch-soft)]/20',
                    )}
                  >
                    <td className="px-3 py-2 align-top">
                      <p className="text-xs font-medium text-foreground">{row.label}</p>
                      <p className="mt-0.5 max-w-sm text-[10px] leading-snug text-muted-foreground">
                        {row.description}
                      </p>
                      {row.category === 'SECURITY' ? (
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {SECURITY_CHANNEL_REQUIRED_MESSAGE}
                        </p>
                      ) : null}
                    </td>
                    {NOTIFICATION_CHANNELS.map((ch) => (
                      <td key={ch.key} className="px-2 py-2 text-center align-middle">
                        <div className="flex justify-center py-0.5">
                          <NotificationChannelSwitch
                            row={row}
                            channelKey={ch.key}
                            channelLabel={ch.label}
                            onBlocked={handleBlocked}
                            onToggle={updateRow}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile accordion */}
        <div className="lg:hidden">
          <Accordion type="multiple" className="space-y-2">
            {draft.map((row) => (
              <AccordionItem
                key={row.category}
                value={row.category}
                className="overflow-hidden rounded-xl border border-border/60 border-b bg-muted/10 px-0"
              >
                <AccordionTrigger className="px-3 py-3 hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-border/40">
                  <NotificationRowSummary row={row} />
                </AccordionTrigger>
                <AccordionContent className="px-3 pb-3">
                  {row.category === 'SECURITY' ? (
                    <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                      {SECURITY_CHANNEL_REQUIRED_MESSAGE}
                    </p>
                  ) : null}
                  <div className="space-y-1">
                    {NOTIFICATION_CHANNELS.map((ch) => (
                      <label
                        key={ch.key}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/30"
                      >
                        <span className="text-[11px] font-medium text-foreground">{ch.label}</span>
                        <NotificationChannelSwitch
                          row={row}
                          channelKey={ch.key}
                          channelLabel={ch.label}
                          onBlocked={handleBlocked}
                          onToggle={updateRow}
                        />
                      </label>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </DataCard>
    </div>
  );
}
