import { TripStatus } from '@prisma/client';

import {
  classifyDurableTerminalOutcome,
  readDurableTerminalOutcome,
  resolveTerminalRestingRecoveryWake,
} from './trip-terminal-lifecycle-commit.util';

const TRIP1 = 'trip-1';

describe('trip-terminal-lifecycle-commit.util (R7A)', () => {
  it('COMPLETE + COMPLETED → TERMINAL_EXPECTED', () => {
    expect(
      classifyDurableTerminalOutcome({
        intent: 'COMPLETE',
        trip: {
          id: TRIP1,
          tripStatus: TripStatus.COMPLETED,
          endTime: new Date('2026-09-06T13:58:00.000Z'),
        },
      }),
    ).toBe('TERMINAL_EXPECTED');
  });

  it('COMPLETE + ONGOING → NOT_TERMINAL', () => {
    expect(
      classifyDurableTerminalOutcome({
        intent: 'COMPLETE',
        trip: { id: TRIP1, tripStatus: TripStatus.ONGOING },
      }),
    ).toBe('NOT_TERMINAL');
  });

  it('CANCEL + CANCELLED → TERMINAL_EXPECTED', () => {
    expect(
      classifyDurableTerminalOutcome({
        intent: 'CANCEL',
        trip: { id: TRIP1, tripStatus: TripStatus.CANCELLED },
      }),
    ).toBe('TERMINAL_EXPECTED');
  });

  it('CANCEL + ONGOING → NOT_TERMINAL', () => {
    expect(
      classifyDurableTerminalOutcome({
        intent: 'CANCEL',
        trip: { id: TRIP1, tripStatus: TripStatus.ONGOING },
      }),
    ).toBe('NOT_TERMINAL');
  });

  it('A — durable read throws → AMBIGUOUS', async () => {
    const outcome = await readDurableTerminalOutcome(
      {
        vehicleTrip: {
          findUnique: jest.fn().mockRejectedValue(new Error('db down')),
        },
      },
      { intent: 'COMPLETE', tripId: TRIP1 },
    );
    expect(outcome).toBe('AMBIGUOUS');
  });

  it('B — trip row missing → AMBIGUOUS', () => {
    expect(
      classifyDurableTerminalOutcome({ intent: 'COMPLETE', trip: null }),
    ).toBe('AMBIGUOUS');
  });

  it('C — COMPLETE intent + CANCELLED row → AMBIGUOUS', () => {
    expect(
      classifyDurableTerminalOutcome({
        intent: 'COMPLETE',
        trip: { id: TRIP1, tripStatus: TripStatus.CANCELLED },
      }),
    ).toBe('AMBIGUOUS');
  });

  it('D — CANCEL intent + COMPLETED row → AMBIGUOUS', () => {
    expect(
      classifyDurableTerminalOutcome({
        intent: 'CANCEL',
        trip: { id: TRIP1, tripStatus: TripStatus.COMPLETED },
      }),
    ).toBe('AMBIGUOUS');
  });

  it('resolveTerminalRestingRecoveryWake — committed-but-rejected COMPLETE', () => {
    expect(
      resolveTerminalRestingRecoveryWake({
        restingTransitionSucceeded: false,
        terminalTripId: TRIP1,
        terminalLifecycleCommit: 'NONE',
        terminalLifecycleIntent: 'COMPLETE',
        durableOutcome: 'TERMINAL_EXPECTED',
      }),
    ).toEqual({
      shouldWake: true,
      effectiveCommit: 'COMPLETED',
      durableOutcome: 'TERMINAL_EXPECTED',
    });
  });

  it('resolveTerminalRestingRecoveryWake — true pre-commit NOT_TERMINAL', () => {
    expect(
      resolveTerminalRestingRecoveryWake({
        restingTransitionSucceeded: false,
        terminalTripId: TRIP1,
        terminalLifecycleCommit: 'NONE',
        terminalLifecycleIntent: 'COMPLETE',
        durableOutcome: 'NOT_TERMINAL',
      }).shouldWake,
    ).toBe(false);
  });
});
