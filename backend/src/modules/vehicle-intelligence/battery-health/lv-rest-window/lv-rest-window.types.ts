import type {
  LvRestWindowEventType,
  LvRestWindowState,
} from '../battery-v2-domain';

export interface LvRestWindowSignalContext {
  observedAt: Date;
  providerObservedAt: Date | null;
  providerError: boolean;
  speedKmh: number | null;
  ignitionOn: boolean | null;
  engineRunning: boolean | null;
  hasActiveTrip: boolean;
  isLvCharging: boolean;
  isHvCharging: boolean;
  lvVoltage: number | null;
  lastActivityAt: Date | null;
  tripEndAt: Date | null;
  tripId: string | null;
}

export interface LvRestWindowPolicyContext {
  restWindowSupported: boolean;
  restRequiresEngineOff: boolean;
  maxRestingVoltage: number;
  wakeVoltageThreshold: number;
  stabilityDwellMs: number;
  maxWindowMs: number;
}

export interface LvRestWindowRecord {
  windowId: string;
  state: LvRestWindowState;
  anchorAt: Date;
  startedAt: Date;
  lastTransitionAt: Date;
  tripId: string | null;
  invalidatedReason: string | null;
  lastEventType: LvRestWindowEventType | null;
  confirmedRestingAt: Date | null;
}

export interface LvRestWindowEvent {
  type: LvRestWindowEventType;
  at: Date;
  signal: LvRestWindowSignalContext;
  eventId?: string;
}

export interface LvRestWindowTransition {
  changed: boolean;
  previous: LvRestWindowRecord | null;
  current: LvRestWindowRecord | null;
  reason: string;
}
