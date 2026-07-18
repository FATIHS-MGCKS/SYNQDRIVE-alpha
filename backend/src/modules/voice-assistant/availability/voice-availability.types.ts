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

export type VoiceAfterHoursAction =
  | 'message'
  | 'callback'
  | 'forward'
  | 'fallback';

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
