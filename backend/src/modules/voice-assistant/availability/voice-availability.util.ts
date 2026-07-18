import type { VoiceAssistant } from '@prisma/client';
import type {
  VoiceAvailabilityConfig,
  VoiceAvailabilityConflict,
  VoiceAvailabilityDayKey,
  VoiceAvailabilityDaySchedule,
  VoiceAvailabilityPreviewItem,
  VoiceAvailabilityWindow,
  VoiceHolidayEntry,
  VoiceSpecialHoursEntry,
} from './voice-availability.types';

const DAY_ORDER: VoiceAvailabilityDayKey[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
];

const DAY_LABELS: Record<VoiceAvailabilityDayKey, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

function defaultWeeklySchedule(): VoiceAvailabilityDaySchedule[] {
  return DAY_ORDER.map((day) => ({
    day,
    closed: day === 'sat' || day === 'sun',
    windows:
      day === 'sat' || day === 'sun'
        ? []
        : [{ open: '09:00', close: '18:00' }],
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

export function parseAvailabilityConfig(
  assistant: Pick<
    VoiceAssistant,
    | 'businessHours'
    | 'businessHoursStart'
    | 'businessHoursEnd'
    | 'businessHoursTimezone'
    | 'afterHoursMessage'
    | 'escalationPhone'
    | 'fallbackMessage'
    | 'escalateOnRequest'
    | 'escalateOnLowConf'
    | 'escalateOnSensitive'
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

  const weeklySchedule =
    weeklyFromRaw ??
    scheduleFromLegacy ??
    legacyFlatSchedule(assistant.businessHoursStart, assistant.businessHoursEnd);

  const routingRaw =
    raw.routing && typeof raw.routing === 'object' && !Array.isArray(raw.routing)
      ? (raw.routing as VoiceAvailabilityConfig['routing'])
      : null;

  return {
    timezone:
      (typeof raw.timezone === 'string' && raw.timezone) ||
      assistant.businessHoursTimezone ||
      'Europe/Berlin',
    weeklySchedule,
    specialHours: Array.isArray(raw.specialHours)
      ? (raw.specialHours as VoiceSpecialHoursEntry[])
      : [],
    holidays: Array.isArray(raw.holidays) ? (raw.holidays as VoiceHolidayEntry[]) : [],
    afterHoursMessage:
      (typeof raw.afterHoursMessage === 'string' && raw.afterHoursMessage) ||
      assistant.afterHoursMessage ||
      '',
    afterHoursAction:
      (raw.afterHoursAction as VoiceAvailabilityConfig['afterHoursAction']) || 'message',
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

function legacyFlatSchedule(
  start: string | null | undefined,
  end: string | null | undefined,
): VoiceAvailabilityDaySchedule[] {
  const open = start?.trim() || '09:00';
  const close = end?.trim() || '18:00';
  return DAY_ORDER.map((day) => ({
    day,
    closed: day === 'sat' || day === 'sun',
    windows: day === 'sat' || day === 'sun' ? [] : [{ open, close }],
  }));
}

function groupLegacySchedule(
  rows: Array<{ day: string; open?: string; close?: string; closed?: boolean }>,
): VoiceAvailabilityDaySchedule[] {
  const map = new Map<VoiceAvailabilityDayKey, VoiceAvailabilityDaySchedule>();
  for (const day of DAY_ORDER) {
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

  return DAY_ORDER.map((day) => map.get(day) ?? { day, closed: true, windows: [] });
}

function normalizeDayKey(value: string): VoiceAvailabilityDayKey | null {
  const normalized = value.trim().toLowerCase();
  if ((DAY_ORDER as string[]).includes(normalized)) {
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

export function serializeAvailabilityConfig(
  config: VoiceAvailabilityConfig,
): Record<string, unknown> {
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

  const firstOpenDay = config.weeklySchedule.find((d) => !d.closed && d.windows.length > 0);
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

export function availabilityFlatFieldsFromConfig(config: VoiceAvailabilityConfig): {
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
  businessHoursTimezone: string | null;
  afterHoursMessage: string | null;
  escalationPhone: string | null;
  fallbackMessage: string | null;
} {
  const firstOpenDay = config.weeklySchedule.find((d) => !d.closed && d.windows.length > 0);
  const firstWindow = firstOpenDay?.windows[0];
  return {
    businessHoursStart: firstWindow?.open ?? null,
    businessHoursEnd: firstWindow?.close ?? null,
    businessHoursTimezone: config.timezone || null,
    afterHoursMessage: config.afterHoursMessage || null,
    escalationPhone: config.routing.forwardPhone ?? null,
    fallbackMessage: config.routing.fallbackMessage ?? null,
  };
}

export function detectAvailabilityConflicts(
  config: VoiceAvailabilityConfig,
): VoiceAvailabilityConflict[] {
  const conflicts: VoiceAvailabilityConflict[] = [];

  for (const day of config.weeklySchedule) {
    if (day.closed) continue;
    for (let i = 0; i < day.windows.length; i += 1) {
      const window = day.windows[i];
      if (parseTime(window.open) == null || parseTime(window.close) == null) {
        conflicts.push({
          code: 'invalid_window',
          message: `${DAY_LABELS[day.day]} has an invalid time window.`,
          severity: 'error',
        });
      } else if (parseTime(window.open)! >= parseTime(window.close)!) {
        conflicts.push({
          code: 'window_order',
          message: `${DAY_LABELS[day.day]} window must end after it starts.`,
          severity: 'error',
        });
      }
      for (let j = i + 1; j < day.windows.length; j += 1) {
        if (windowsOverlap(day.windows[i], day.windows[j])) {
          conflicts.push({
            code: 'overlap',
            message: `${DAY_LABELS[day.day]} has overlapping time windows.`,
            severity: 'error',
          });
        }
      }
    }
  }

  const holidayDates = new Set(config.holidays.map((h) => h.date));
  for (const special of config.specialHours) {
    if (holidayDates.has(special.date)) {
      conflicts.push({
        code: 'holiday_special_overlap',
        message: `Special hours on ${special.date} overlap with a holiday entry.`,
        severity: 'warning',
      });
    }
  }

  const priorities = config.routing.staffGroups.map((g) => g.priority);
  if (new Set(priorities).size !== priorities.length) {
    conflicts.push({
      code: 'staff_priority_duplicate',
      message: 'Staff group priorities must be unique.',
      severity: 'warning',
    });
  }

  if (!config.routing.fallbackMessage?.trim() && !config.routing.forwardPhone?.trim()) {
    conflicts.push({
      code: 'fallback_missing',
      message: 'Configure a fallback message or forwarding target.',
      severity: 'error',
    });
  }

  if (config.routing.maxCallDurationMinutes < 5 || config.routing.maxCallDurationMinutes > 120) {
    conflicts.push({
      code: 'duration_range',
      message: 'Maximum call duration should be between 5 and 120 minutes.',
      severity: 'warning',
    });
  }

  return conflicts;
}

export function buildAvailabilityPreview(
  config: VoiceAvailabilityConfig,
): VoiceAvailabilityPreviewItem[] {
  const items: VoiceAvailabilityPreviewItem[] = [
    {
      priority: 1,
      label: 'Holiday',
      when: 'Configured public holidays',
      outcome: 'Closed — after-hours routing applies',
    },
    {
      priority: 2,
      label: 'Special hours',
      when: 'Date-specific overrides',
      outcome: 'Custom windows or closed day',
    },
    {
      priority: 3,
      label: 'Weekly plan',
      when: 'Regular business windows',
      outcome: 'Assistant answers within configured hours',
    },
    {
      priority: 4,
      label: 'After hours',
      when: 'Outside all open windows',
      outcome: describeAfterHoursOutcome(config),
    },
    {
      priority: 5,
      label: 'Escalation triggers',
      when: 'During open hours on sensitive topics',
      outcome: 'Forward to staff or fallback per routing rules',
    },
  ];

  if (config.routing.loopProtectionEnabled) {
    items.push({
      priority: 6,
      label: 'Loop protection',
      when: `More than ${config.routing.maxTransferHops} transfer hops`,
      outcome: 'End with fallback message instead of bouncing callers',
    });
  }

  items.push({
    priority: 7,
    label: 'Max duration',
    when: `Call exceeds ${config.routing.maxCallDurationMinutes} minutes`,
    outcome: 'Controlled wrap-up and handover',
  });

  return items.sort((a, b) => a.priority - b.priority);
}

function describeAfterHoursOutcome(config: VoiceAvailabilityConfig): string {
  switch (config.afterHoursAction) {
    case 'callback':
      return config.routing.callbackEnabled
        ? 'Offer callback capture, then after-hours message'
        : 'Play after-hours message';
    case 'forward':
      return config.routing.forwardPhone
        ? `Forward to ${config.routing.forwardPhone}`
        : 'Play after-hours message (no forward target)';
    case 'fallback':
      return config.routing.fallbackMessage?.trim()
        ? 'Play fallback message'
        : 'Play after-hours message';
    default:
      return config.afterHoursMessage?.trim()
        ? 'Play after-hours message'
        : 'Default closed notice';
  }
}

export function isAvailabilityConfigured(assistant: VoiceAssistant): boolean {
  const config = parseAvailabilityConfig(assistant);
  const hasOpenWindow = config.weeklySchedule.some(
    (day) => !day.closed && day.windows.length > 0,
  );
  const hasFallback =
    Boolean(config.routing.fallbackMessage?.trim()) ||
    Boolean(config.routing.forwardPhone?.trim());
  return hasOpenWindow && hasFallback && detectAvailabilityConflicts(config).every((c) => c.severity !== 'error');
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
