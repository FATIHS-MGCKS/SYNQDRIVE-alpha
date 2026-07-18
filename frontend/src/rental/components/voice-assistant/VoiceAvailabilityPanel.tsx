import { useCallback, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../../../components/ui/accordion';
import { StatusChip } from '../../../components/patterns';
import { VoiceInlineNotice, VoiceSectionHeader } from '../../../components/voice-ui';
import { cn } from '../../../components/ui/utils';
import type { VoiceAssistantData } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import {
  AVAILABILITY_DAY_LABEL_KEYS,
  AVAILABILITY_DAY_ORDER,
  STAFF_GROUP_PRESETS,
  availabilityPayloadFromConfig,
  buildAvailabilityPreview,
  createId,
  detectAvailabilityConflicts,
  parseAvailabilityConfig,
  type VoiceAvailabilityConfig,
  type VoiceAvailabilityDayKey,
  type VoiceHolidayEntry,
  type VoiceSpecialHoursEntry,
} from './voice-availability.ops';

interface VoiceAvailabilityPanelProps {
  assistant: VoiceAssistantData;
  isDarkMode?: boolean;
  saving?: boolean;
  onSave: (payload: ReturnType<typeof availabilityPayloadFromConfig>) => void | Promise<void>;
}

export function VoiceAvailabilityPanel({
  assistant,
  isDarkMode = false,
  saving = false,
  onSave,
}: VoiceAvailabilityPanelProps) {
  const { t } = useLanguage();
  const initial = useMemo(() => parseAvailabilityConfig(assistant), [assistant]);
  const [config, setConfig] = useState<VoiceAvailabilityConfig>(initial);
  const [mobileDay, setMobileDay] = useState<VoiceAvailabilityDayKey>('mon');

  const conflicts = useMemo(() => detectAvailabilityConflicts(config), [config]);
  const preview = useMemo(() => buildAvailabilityPreview(config), [config]);
  const hasErrors = conflicts.some(c => c.severity === 'error');

  const inputCls = cn(
    'w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors',
    isDarkMode
      ? 'surface-premium border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'border border-gray-200 bg-gray-50 text-gray-800 focus:border-purple-400',
  );
  const labelCls = cn('block text-[11px] font-semibold mb-1', isDarkMode ? 'text-muted-foreground' : 'text-gray-500');

  const updateDay = useCallback((day: VoiceAvailabilityDayKey, patch: Partial<VoiceAvailabilityConfig['weeklySchedule'][number]>) => {
    setConfig(current => ({
      ...current,
      weeklySchedule: current.weeklySchedule.map(row => (row.day === day ? { ...row, ...patch } : row)),
    }));
  }, []);

  const addWindow = (day: VoiceAvailabilityDayKey) => {
    const row = config.weeklySchedule.find(d => d.day === day);
    const last = row?.windows[row.windows.length - 1];
    updateDay(day, {
      closed: false,
      windows: [...(row?.windows ?? []), { open: last?.close ?? '09:00', close: '18:00' }],
    });
  };

  const handleSave = () => {
    void onSave(
      availabilityPayloadFromConfig(config, {
        escalateOnRequest: assistant.escalateOnRequest ?? true,
        escalateOnLowConf: assistant.escalateOnLowConf ?? true,
        escalateOnSensitive: assistant.escalateOnSensitive ?? true,
      }),
    );
  };

  const addHoliday = () => {
    const entry: VoiceHolidayEntry = { id: createId(), date: '', label: '' };
    setConfig(current => ({ ...current, holidays: [...current.holidays, entry] }));
  };

  const addSpecial = () => {
    const entry: VoiceSpecialHoursEntry = { id: createId(), date: '', label: '', windows: [{ open: '10:00', close: '14:00' }] };
    setConfig(current => ({ ...current, specialHours: [...current.specialHours, entry] }));
  };

  const addStaffGroup = (groupKey: string, label: string) => {
    setConfig(current => ({
      ...current,
      routing: {
        ...current.routing,
        staffGroups: [
          ...current.routing.staffGroups,
          {
            id: createId(),
            groupKey,
            label,
            phoneE164: '',
            priority: current.routing.staffGroups.length + 1,
          },
        ],
      },
    }));
  };

  return (
    <div className="space-y-4">
      <VoiceSectionHeader
        title={t('voice.availability.title')}
        description={t('voice.availability.description')}
      />

      {conflicts.length > 0 && (
        <div className="space-y-2">
          {conflicts.map(conflict => (
            <VoiceInlineNotice
              key={conflict.code + conflict.message}
              tone={conflict.severity === 'error' ? 'blocked' : 'warning'}
              title={t('voice.availability.conflictTitle')}
            >
              {conflict.message}
            </VoiceInlineNotice>
          ))}
        </div>
      )}

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.availability.weeklyPlan')}</h4>
        <p className="mt-1 text-[10px] text-muted-foreground">{t('voice.availability.weeklyPlanDesc')}</p>

        <div className="mt-3">
          <label className={labelCls}>{t('voice.availability.timezone')}</label>
          <input
            className={cn(inputCls, 'max-w-sm')}
            value={config.timezone}
            onChange={e => setConfig(current => ({ ...current, timezone: e.target.value }))}
            placeholder="Europe/Berlin"
          />
        </div>

        <div className="mt-4 flex gap-1 overflow-x-auto pb-1 md:hidden">
          {AVAILABILITY_DAY_ORDER.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => setMobileDay(day)}
              className={cn(
                'shrink-0 rounded-lg border px-3 py-1.5 text-[10px] font-semibold',
                mobileDay === day
                  ? 'border-[color:var(--brand)]/35 bg-[color:var(--brand-soft)]'
                  : 'border-border/50',
              )}
            >
              {t(AVAILABILITY_DAY_LABEL_KEYS[day] as 'voice.availability.day.mon')}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {AVAILABILITY_DAY_ORDER.map(day => {
            const row = config.weeklySchedule.find(d => d.day === day)!;
            return (
              <div
                key={day}
                className={cn(
                  'rounded-xl border border-border/40 p-3',
                  day !== mobileDay && 'hidden md:block',
                  day === mobileDay && 'block',
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-foreground">
                    {t(AVAILABILITY_DAY_LABEL_KEYS[day] as 'voice.availability.day.mon')}
                  </p>
                  <label className="flex items-center gap-2 text-[10px]">
                    <input
                      type="checkbox"
                      checked={Boolean(row.closed)}
                      onChange={e => updateDay(day, { closed: e.target.checked, windows: e.target.checked ? [] : [{ open: '09:00', close: '18:00' }] })}
                    />
                    {t('voice.availability.closed')}
                  </label>
                </div>

                {!row.closed && (
                  <div className="mt-2 space-y-2">
                    {row.windows.map((window, index) => (
                      <div key={`${day}-${index}`} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <input
                          type="time"
                          className={inputCls}
                          value={window.open}
                          onChange={e => {
                            const windows = [...row.windows];
                            windows[index] = { ...windows[index], open: e.target.value };
                            updateDay(day, { windows });
                          }}
                        />
                        <input
                          type="time"
                          className={inputCls}
                          value={window.close}
                          onChange={e => {
                            const windows = [...row.windows];
                            windows[index] = { ...windows[index], close: e.target.value };
                            updateDay(day, { windows });
                          }}
                        />
                        {row.windows.length > 1 && (
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-muted-foreground"
                            onClick={() => updateDay(day, { windows: row.windows.filter((_, i) => i !== index) })}
                          >
                            {t('voice.common.remove')}
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addWindow(day)}
                      className="text-[10px] font-semibold text-[color:var(--brand-ink)]"
                    >
                      + {t('voice.availability.addWindow')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Accordion type="multiple" className="space-y-3">
        <AccordionItem value="special" className="surface-premium rounded-2xl border border-border/40 px-4">
          <AccordionTrigger className="text-[12px] font-bold">{t('voice.availability.specialHours')}</AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            {config.specialHours.map(entry => (
              <div key={entry.id} className="rounded-lg border border-border/40 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="date" className={inputCls} value={entry.date} onChange={e => setConfig(c => ({ ...c, specialHours: c.specialHours.map(s => s.id === entry.id ? { ...s, date: e.target.value } : s) }))} />
                  <input className={inputCls} placeholder={t('voice.availability.label')} value={entry.label ?? ''} onChange={e => setConfig(c => ({ ...c, specialHours: c.specialHours.map(s => s.id === entry.id ? { ...s, label: e.target.value } : s) }))} />
                </div>
              </div>
            ))}
            <button type="button" onClick={addSpecial} className="text-[10px] font-semibold text-[color:var(--brand-ink)]">
              + {t('voice.availability.addSpecial')}
            </button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="holidays" className="surface-premium rounded-2xl border border-border/40 px-4">
          <AccordionTrigger className="text-[12px] font-bold">{t('voice.availability.holidays')}</AccordionTrigger>
          <AccordionContent className="space-y-3 pb-4">
            {config.holidays.map(entry => (
              <div key={entry.id} className="grid gap-2 sm:grid-cols-2">
                <input type="date" className={inputCls} value={entry.date} onChange={e => setConfig(c => ({ ...c, holidays: c.holidays.map(h => h.id === entry.id ? { ...h, date: e.target.value } : h) }))} />
                <input className={inputCls} placeholder={t('voice.availability.holidayLabel')} value={entry.label} onChange={e => setConfig(c => ({ ...c, holidays: c.holidays.map(h => h.id === entry.id ? { ...h, label: e.target.value } : h) }))} />
              </div>
            ))}
            <button type="button" onClick={addHoliday} className="text-[10px] font-semibold text-[color:var(--brand-ink)]">
              + {t('voice.availability.addHoliday')}
            </button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.availability.afterHoursTitle')}</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>{t('voice.availability.afterHours')}</label>
            <input className={inputCls} value={config.afterHoursMessage} onChange={e => setConfig(c => ({ ...c, afterHoursMessage: e.target.value }))} />
          </div>
          <div>
            <label className={labelCls}>{t('voice.availability.afterHoursAction')}</label>
            <select
              className={inputCls}
              value={config.afterHoursAction}
              onChange={e => setConfig(c => ({ ...c, afterHoursAction: e.target.value as VoiceAvailabilityConfig['afterHoursAction'] }))}
            >
              <option value="message">{t('voice.availability.action.message')}</option>
              <option value="callback">{t('voice.availability.action.callback')}</option>
              <option value="forward">{t('voice.availability.action.forward')}</option>
              <option value="fallback">{t('voice.availability.action.fallback')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)] sm:p-5">
        <h4 className="text-[12px] font-bold text-foreground">{t('voice.availability.routingTitle')}</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>{t('voice.availability.escalationPhone')}</label>
            <input className={inputCls} value={config.routing.forwardPhone ?? ''} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, forwardPhone: e.target.value } }))} />
          </div>
          <div>
            <label className={labelCls}>{t('voice.availability.fallback')}</label>
            <input className={inputCls} value={config.routing.fallbackMessage ?? ''} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, fallbackMessage: e.target.value } }))} />
          </div>
          <div>
            <label className={labelCls}>{t('voice.availability.maxDuration')}</label>
            <input type="number" min={5} max={120} className={inputCls} value={config.routing.maxCallDurationMinutes} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, maxCallDurationMinutes: Number(e.target.value) } }))} />
          </div>
          <label className="flex items-center gap-2 self-end text-[11px]">
            <input type="checkbox" checked={config.routing.loopProtectionEnabled} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, loopProtectionEnabled: e.target.checked } }))} />
            {t('voice.availability.loopProtection')}
          </label>
          <label className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={config.routing.callbackEnabled} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, callbackEnabled: e.target.checked } }))} />
            {t('voice.availability.callback')}
          </label>
        </div>

        <div className="mt-4">
          <p className="text-[10px] font-semibold text-foreground">{t('voice.availability.staffGroups')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STAFF_GROUP_PRESETS.map(preset => (
              <button
                key={preset.groupKey}
                type="button"
                onClick={() => addStaffGroup(preset.groupKey, t(preset.labelKey as 'voice.availability.staff.rentalOps'))}
                className="rounded-lg border border-border/50 px-2 py-1 text-[10px] font-semibold"
              >
                + {t(preset.labelKey as 'voice.availability.staff.rentalOps')}
              </button>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {config.routing.staffGroups.map(group => (
              <div key={group.id} className="grid gap-2 rounded-lg border border-border/40 p-2 sm:grid-cols-4">
                <input className={inputCls} value={group.label} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, staffGroups: c.routing.staffGroups.map(g => g.id === group.id ? { ...g, label: e.target.value } : g) } }))} />
                <input className={inputCls} value={group.phoneE164 ?? ''} placeholder="+49…" onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, staffGroups: c.routing.staffGroups.map(g => g.id === group.id ? { ...g, phoneE164: e.target.value } : g) } }))} />
                <input type="number" min={1} className={inputCls} value={group.priority} onChange={e => setConfig(c => ({ ...c, routing: { ...c.routing, staffGroups: c.routing.staffGroups.map(g => g.id === group.id ? { ...g, priority: Number(e.target.value) } : g) } }))} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-premium rounded-2xl border border-border/40 p-4 shadow-[var(--shadow-1)]">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-bold text-foreground">{t('voice.availability.previewTitle')}</h4>
          <StatusChip tone="neutral" className="text-[9px]">{t('voice.availability.previewPriority')}</StatusChip>
        </div>
        <div className="mt-3 space-y-2">
          {preview.map(item => (
            <div key={item.priority} className="flex gap-3 rounded-lg border border-border/40 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">{item.priority}</span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground">{item.label}</p>
                <p className="text-[10px] text-muted-foreground">{item.when} → {item.outcome}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={saving || hasErrors}
        onClick={handleSave}
        className="sq-press rounded-xl bg-[color:var(--brand)] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
      >
        {saving ? t('voice.common.saving') : t('voice.common.save')}
      </button>
    </div>
  );
}
