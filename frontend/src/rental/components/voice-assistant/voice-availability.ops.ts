import type { VoiceAssistantData } from '../../../lib/api';

export type VoiceAvailabilityDayKey =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

export type VoiceAvailabilityWindow = {
  open: string;
  close: string;
};

export type VoiceAvailabilityDaySchedule = {
  day: VoiceAvailabilityDayKey;
  closed?: boolean;
  windows: VoiceAvailabilityWindow[];
};

export type VoiceSpecialHoursEntry = {
  id: string;
  date: string;
  label?: string;
  closed?: boolean;
  windows?: VoiceAvailabilityWindow[];
};

export type VoiceHolidayEntry = {
  id: string;
  date: string;
  label: string;
};

export type VoiceStaffGroupRoute = {
  id: string;
  groupKey: string;
  label: string;
  phoneE164?: string | null;
  priority: number;
};

export type VoiceAfterHoursAction = 'message' | 'callback' | 'forward' | 'fallback';

export type VoiceAvailabilityRouting = {
  staffGroups: VoiceStaffGroupRoute[];
  forwardPhone?: string | null;
  callbackEnabled: boolean;
  fallbackMessage?: string | null;
  maxCallDurationMinutes: number;
  loopProtectionEnabled: boolean;
  maxTransferHops: number;
};

export type VoiceAvailabilityConfig = {
  timezone: string;
  weeklySchedule: VoiceAvailabilityDaySchedule[];
  specialHours: VoiceSpecialHoursEntry[];
  holidays: VoiceHolidayEntry[];
  afterHoursMessage: string;
  afterHoursAction: VoiceAfterHoursAction;
  routing: VoiceAvailabilityRouting;
};

export type VoiceAvailabilityConflict = {
  code: string;
  message: string;
  severity: 'warning' | 'error';
};

export type VoiceAvailabilityPreviewItem = {
  priority: number;
  label: string;
  when: string;
  outcome: string;
};

export const AVAILABILITY_DAY_ORDER: VoiceAvailabilityDayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

export const AVAILABILITY_DAY_LABEL_KEYS: Record<VoiceAvailabilityDayKey, string> = {
  mon: 'voice.availability.day.mon',
  tue: 'voice.availability.day.tue',
  wed: 'voice.availability.day.wed',
  thu: 'voice.availability.day.thu',
  fri: 'voice.availability.day.fri',
  sat: 'voice.availability.day.sat',
  sun: 'voice.availability.day.sun',
};

export const STAFF_GROUP_PRESETS = [
  { groupKey: 'rental_ops', labelKey: 'voice.availability.staff.rentalOps' },
  { groupKey: 'roadside', labelKey: 'voice.availability.staff.roadside' },
  { groupKey: 'billing', labelKey: 'voice.availability.staff.billing' },
  { groupKey: 'management', labelKey: 'voice.availability.staff.management' },
] as const;

function defaultWeeklySchedule(): VoiceAvailabilityDaySchedule[] {
  return AVAILABILITY_DAY_ORDER.map(day => ({
    day,
    closed: day === 'sat' || day === 'sun',
    windows: day === 'sat' || day === 'sun' ? [] : [{ open: '09:00', close: '18:00' }],
  }));
}

function parseTime(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function windowsOverlap(a: VoiceAvailabilityWindow, b: VoiceAvailabilityWindow): boolean {
  const aOpen = parseTime(a.open);
  const aClose = parseTime(a.close);
  const bOpen = parseTime(b.open);
  const bClose = parseTime(b.close);
  if (aOpen == null || aClose == null || bOpen == null || bClose == null) return false;
  if (aOpen >= aClose || bOpen >= bClose) return true;
  return aOpen < bClose && bOpen < aClose;
}

function normalizeDayKey(value: string): VoiceAvailabilityDayKey | null {
  const normalized = value.trim().toLowerCase();
  if ((AVAILABILITY_DAY_ORDER as string[]).includes(normalized)) {
    return normalized as VoiceAvailabilityDayKey;
  }
  const aliases: Record<string, VoiceAvailabilityDayKey> = {
    monday: 'mon',
    tuesday: 'tue',
    wednesday: 'wed',
    thursday: 'thu',
    friday: 'fri',
    saturday: 'sat',
    sunday: 'sun',
  };
  return aliases[normalized] ?? null;
}

function groupLegacySchedule(
  rows: Array<{ day: string; open?: string; close?: string; closed?: boolean }>,
): VoiceAvailabilityDaySchedule[] {
  const map = new Map<VoiceAvailabilityDayKey, VoiceAvailabilityDaySchedule>();
  for (const day of AVAILABILITY_DAY_ORDER) {
    map.set(day, { day, closed: false, windows: [] });
  }
  for (const row of rows) {
    const key = normalizeDayKey(row.day);
    if (!key) continue;
    const current = map.get(key)!;
    if (row.closed) {
      current.closed = true;
      current.windows = [];
      continue;
    }
    if (row.open && row.close) {
      current.windows.push({ open: row.open, close: row.close });
    }
  }
  return AVAILABILITY_DAY_ORDER.map(day => map.get(day) ?? { day, closed: true, windows: [] });
}

function legacyFlatSchedule(start?: string | null, end?: string | null): VoiceAvailabilityDaySchedule[] {
  const open = start?.trim() || '09:00';
  const close = end?.trim() || '18:00';
  return AVAILABILITY_DAY_ORDER.map(day => ({
    day,
    closed: day === 'sat' || day === 'sun',
    windows: day === 'sat' || day === 'sun' ? [] : [{ open, close }],
  }));
}

export function parseAvailabilityConfig(
  assistant: Pick<
    VoiceAssistantData,
    | 'businessHours'
    | 'businessHoursStart'
    | 'businessHoursEnd'
    | 'businessHoursTimezone'
    | 'afterHoursMessage'
    | 'escalationPhone'
    | 'fallbackMessage'
  >,
): VoiceAvailabilityConfig {
  const raw =
    assistant.businessHours && typeof assistant.businessHours === 'object' && !Array.isArray(assistant.businessHours)
      ? (assistant.businessHours as Record<string, unknown>)
      : {};

  const weeklyFromRaw = Array.isArray(raw.weeklySchedule)
    ? (raw.weeklySchedule as VoiceAvailabilityDaySchedule[])
    : null;
  const scheduleFromLegacy = Array.isArray(raw.schedule)
    ? groupLegacySchedule(raw.schedule as Array<{ day: string; open?: string; close?: string; closed?: boolean }>)
    : null;

  const routingRaw =
    raw.routing && typeof raw.routing === 'object' && !Array.isArray(raw.routing)
      ? (raw.routing as VoiceAvailabilityRouting)
      : null;

  return {
    timezone:
      (typeof raw.timezone === 'string' && raw.timezone) ||
      assistant.businessHoursTimezone ||
      'Europe/Berlin',
    weeklySchedule:
      weeklyFromRaw ??
      scheduleFromLegacy ??
      legacyFlatSchedule(assistant.businessHoursStart, assistant.businessHoursEnd),
    specialHours: Array.isArray(raw.specialHours) ? (raw.specialHours as VoiceSpecialHoursEntry[]) : [],
    holidays: Array.isArray(raw.holidays) ? (raw.holidays as VoiceHolidayEntry[]) : [],
    afterHoursMessage:
      (typeof raw.afterHoursMessage === 'string' && raw.afterHoursMessage) ||
      assistant.afterHoursMessage ||
      '',
    afterHoursAction: (raw.afterHoursAction as VoiceAfterHoursAction) || 'message',
    routing: {
      staffGroups: routingRaw?.staffGroups ?? [],
      forwardPhone: routingRaw?.forwardPhone ?? assistant.escalationPhone ?? null,
      callbackEnabled: routingRaw?.callbackEnabled ?? true,
      fallbackMessage: routingRaw?.fallbackMessage ?? assistant.fallbackMessage ?? null,
      maxCallDurationMinutes: routingRaw?.maxCallDurationMinutes ?? 20,
      loopProtectionEnabled: routingRaw?.loopProtectionEnabled ?? true,
      maxTransferHops: routingRaw?.maxTransferHops ?? 2,
    },
  };
}

export function serializeAvailabilityConfig(config: VoiceAvailabilityConfig): Record<string, unknown> {
  const schedule: Array<{ day: string; open?: string; close?: string; closed?: boolean }> = [];
  for (const day of config.weeklySchedule) {
    if (day.closed || day.windows.length === 0) {
      schedule.push({ day: day.day, closed: true });
      continue;
    }
    for (const window of day.windows) {
      schedule.push({ day: day.day, open: window.open, close: window.close });
    }
  }

  const firstOpenDay = config.weeklySchedule.find(d => !d.closed && d.windows.length > 0);
  const firstWindow = firstOpenDay?.windows[0];

  return {
    timezone: config.timezone,
    start: firstWindow?.open ?? null,
    end: firstWindow?.close ?? null,
    afterHoursMessage: config.afterHoursMessage,
    afterHoursAction: config.afterHoursAction,
    weeklySchedule: config.weeklySchedule,
    specialHours: config.specialHours,
    holidays: config.holidays,
    routing: config.routing,
    schedule,
  };
}

export function availabilityPayloadFromConfig(
  config: VoiceAvailabilityConfig,
  triggers: {
    escalateOnRequest: boolean;
    escalateOnLowConf: boolean;
    escalateOnSensitive: boolean;
  },
) {
  const flat = {
    businessHoursStart: config.weeklySchedule.find(d => !d.closed && d.windows[0])?.windows[0]?.open ?? null,
    businessHoursEnd: config.weeklySchedule.find(d => !d.closed && d.windows[0])?.windows[0]?.close ?? null,
    businessHoursTimezone: config.timezone,
    afterHoursMessage: config.afterHoursMessage,
    escalationPhone: config.routing.forwardPhone ?? null,
    fallbackMessage: config.routing.fallbackMessage ?? null,
    ...triggers,
  };

  return {
    businessHoursStart: flat.businessHoursStart ?? undefined,
    businessHoursEnd: flat.businessHoursEnd ?? undefined,
    businessHoursTimezone: flat.businessHoursTimezone ?? undefined,
    afterHoursMessage: flat.afterHoursMessage ?? undefined,
    escalationPhone: flat.escalationPhone ?? undefined,
    fallbackMessage: flat.fallbackMessage ?? undefined,
    escalateOnRequest: triggers.escalateOnRequest,
    escalateOnLowConf: triggers.escalateOnLowConf,
    escalateOnSensitive: triggers.escalateOnSensitive,
    businessHours: serializeAvailabilityConfig(config),
  };
}

export function detectAvailabilityConflicts(config: VoiceAvailabilityConfig): VoiceAvailabilityConflict[] {
  const conflicts: VoiceAvailabilityConflict[] = [];

  for (const day of config.weeklySchedule) {
    if (day.closed) continue;
    for (let i = 0; i < day.windows.length; i += 1) {
      const window = day.windows[i];
      if (parseTime(window.open) == null || parseTime(window.close) == null) {
        conflicts.push({
          code: 'invalid_window',
          message: `${day.day}: invalid time window`,
          severity: 'error',
        });
      } else if (parseTime(window.open)! >= parseTime(window.close)!) {
        conflicts.push({
          code: 'window_order',
          message: `${day.day}: end must be after start`,
          severity: 'error',
        });
      }
      for (let j = i + 1; j < day.windows.length; j += 1) {
        if (windowsOverlap(day.windows[i], day.windows[j])) {
          conflicts.push({
            code: 'overlap',
            message: `${day.day}: overlapping windows`,
            severity: 'error',
          });
        }
      }
    }
  }

  const holidayDates = new Set(config.holidays.map(h => h.date));
  for (const special of config.specialHours) {
    if (holidayDates.has(special.date)) {
      conflicts.push({
        code: 'holiday_special_overlap',
        message: `Special hours overlap holiday on ${special.date}`,
        severity: 'warning',
      });
    }
  }

  if (!config.routing.fallbackMessage?.trim() && !config.routing.forwardPhone?.trim()) {
    conflicts.push({
      code: 'fallback_missing',
      message: 'Fallback message or forwarding target required',
      severity: 'error',
    });
  }

  return conflicts;
}

export function buildAvailabilityPreview(config: VoiceAvailabilityConfig): VoiceAvailabilityPreviewItem[] {
  return [
    { priority: 1, label: 'Holiday', when: 'Public holidays', outcome: 'Closed — after-hours routing' },
    { priority: 2, label: 'Special hours', when: 'Date overrides', outcome: 'Custom windows or closed' },
    { priority: 3, label: 'Weekly plan', when: 'Regular hours', outcome: 'Assistant answers' },
    {
      priority: 4,
      label: 'After hours',
      when: 'Outside open windows',
      outcome: config.afterHoursAction,
    },
    { priority: 5, label: 'Escalation', when: 'Sensitive topics', outcome: 'Staff forward or fallback' },
    {
      priority: 6,
      label: 'Loop protection',
      when: `>${config.routing.maxTransferHops} hops`,
      outcome: config.routing.loopProtectionEnabled ? 'Fallback ends loop' : 'Disabled',
    },
    {
      priority: 7,
      label: 'Max duration',
      when: `${config.routing.maxCallDurationMinutes} min`,
      outcome: 'Controlled wrap-up',
    },
  ];
}

export function isAvailabilityStepComplete(assistant: VoiceAssistantData): boolean {
  const config = parseAvailabilityConfig(assistant);
  const hasOpenWindow = config.weeklySchedule.some(day => !day.closed && day.windows.length > 0);
  const hasFallback = Boolean(config.routing.fallbackMessage?.trim() || config.routing.forwardPhone?.trim());
  const conflicts = detectAvailabilityConflicts(config);
  return hasOpenWindow && hasFallback && conflicts.every(c => c.severity !== 'error');
}

export function defaultAvailabilityConfig(): VoiceAvailabilityConfig {
  return {
    timezone: 'Europe/Berlin',
    weeklySchedule: defaultWeeklySchedule(),
    specialHours: [],
    holidays: [],
    afterHoursMessage: '',
    afterHoursAction: 'message',
    routing: {
      staffGroups: [],
      forwardPhone: null,
      callbackEnabled: true,
      fallbackMessage: null,
      maxCallDurationMinutes: 20,
      loopProtectionEnabled: true,
      maxTransferHops: 2,
    },
  };
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
