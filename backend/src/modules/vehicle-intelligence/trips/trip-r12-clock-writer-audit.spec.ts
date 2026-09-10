import * as fs from 'fs';
import * as path from 'path';

import {
  clearPossibleEndClockFields,
  reconcilePossibleEndClockColumns,
  resolvePossibleEndBoundaryAnchor,
  resolvePossibleEndFsmDwellAnchor,
  readPossibleEndEnteredAtFromEvidence,
} from './trip-fsm-clock-contract';
import { buildPossibleEndToActiveReset } from './trip-end-cycle-reset';
import { buildMidGapSplitActiveFsmExtras } from './trip-mid-gap-fsm.util';
import { TripDetectionState } from '@prisma/client';

describe('R12 clock writer audit (RED-A)', () => {
  const TRIPS_DIR = path.join(__dirname);
  const ORCHESTRATION = path.join(TRIPS_DIR, 'trip-detection-orchestration.service.ts');

  type WriterRow = {
    writer: string;
    clearsPossibleEndAt: boolean;
    clearsPossibleEndEnteredAt: boolean;
    accompanyingState: string;
  };

  const CLOCK_WRITER_MATRIX: WriterRow[] = [
    {
      writer: 'clearPossibleEndClockFields()',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'ACTIVE_TRIP | RESTING (via transitionState)',
    },
    {
      writer: 'buildPossibleEndToActiveReset() → spread',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'ACTIVE_TRIP only',
    },
    {
      writer: 'buildMidGapSplitActiveFsmExtras() → spread',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'ACTIVE_TRIP only (mid-gap split repoint)',
    },
    {
      writer: 'reconcilePossibleEndClockColumns()',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'POSSIBLE_END (restore-only patch; never nulls)',
    },
    {
      writer: 'transitionState(..., POSSIBLE_END, evidence-only patches)',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'POSSIBLE_END (PEC/EV/FIN evidence updates)',
    },
    {
      writer: 'prisma vehicleTripDetectionState.updateMany (lock fields only)',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'any (worker lock only)',
    },
  ];

  it('CLOCK_WRITER_MATRIX — bounded catalog of clock mutators', () => {
    expect(CLOCK_WRITER_MATRIX.length).toBeGreaterThanOrEqual(5);
    const peStayClearWriters = CLOCK_WRITER_MATRIX.filter(
      (row) =>
        row.clearsPossibleEndAt &&
        row.clearsPossibleEndEnteredAt &&
        row.accompanyingState.includes('POSSIBLE_END') &&
        !row.accompanyingState.includes('ACTIVE_TRIP') &&
        !row.accompanyingState.includes('RESTING'),
    );
    expect(peStayClearWriters).toEqual([]);
  });

  it('DIRECT_CLOCK_CLEAR_WRITER — none while state stays POSSIBLE_END', () => {
    expect(clearPossibleEndClockFields()).toEqual({
      possibleEndAt: null,
      possibleEndEnteredAt: null,
    });
    const reset = buildPossibleEndToActiveReset({
      workerNow: new Date(),
      priorSummary: {},
    });
    expect(reset.possibleEndAt).toBeNull();
    expect(reset.possibleEndEnteredAt).toBeNull();

    const midGap = buildMidGapSplitActiveFsmExtras({
      secondTripId: 'trip-2',
      secondStartAt: new Date(),
    });
    expect(midGap.possibleEndAt).toBeNull();
    expect(midGap.possibleEndEnteredAt).toBeNull();
  });

  it('repository static audit — no possibleEndAt:null under POSSIBLE_END transition', () => {
    const src = fs.readFileSync(ORCHESTRATION, 'utf8');
    expect(src).not.toMatch(
      /transitionState\([^)]*TripDetectionState\.POSSIBLE_END[^)]*possibleEndAt:\s*null/s,
    );
    expect(src).not.toMatch(
      /transitionState\([^)]*TripDetectionState\.POSSIBLE_END[^)]*possibleEndEnteredAt:\s*null/s,
    );
    expect(src).not.toMatch(
      /\.\.\.clearPossibleEndClockFields\(\)[\s\S]{0,120}TripDetectionState\.POSSIBLE_END/,
    );
  });

  it('INDIRECT_CLOCK_LOSS_SEQUENCE — NULL columns + POSSIBLE_END + durable evidence', () => {
    const workerNow = new Date('2026-09-10T20:35:00.000Z');
    const evidence = {
      stopBoundaryAt: '2026-09-10T20:01:15.000Z',
      stopBoundaryTrust: true,
      stopBoundarySource: 'provider_stationary_vls',
      possibleEndEnteredAt: '2026-09-10T20:04:37.793Z',
    };
    const det = {
      possibleEndAt: null,
      possibleEndEnteredAt: null,
      updatedAt: workerNow,
      lastEvidenceSummary: evidence,
    };

    expect(
      reconcilePossibleEndClockColumns({
        state: TripDetectionState.POSSIBLE_END,
        possibleEndAt: null,
        possibleEndEnteredAt: null,
        lastEvidenceSummary: evidence,
        workerNow,
      }),
    ).toEqual({
      possibleEndAt: new Date('2026-09-10T20:01:15.000Z'),
      possibleEndEnteredAt: new Date('2026-09-10T20:04:37.793Z'),
    });

    expect(resolvePossibleEndBoundaryAnchor(det, workerNow).toISOString()).toBe(
      evidence.stopBoundaryAt,
    );
    expect(resolvePossibleEndFsmDwellAnchor(det, workerNow).toISOString()).toBe(
      evidence.possibleEndEnteredAt,
    );
    expect(readPossibleEndEnteredAtFromEvidence(evidence)?.toISOString()).toBe(
      evidence.possibleEndEnteredAt,
    );
  });

  it('reconcilePossibleEndClockColumns never fabricates workerNow episode token', () => {
    const workerNow = new Date('2026-09-10T20:35:00.000Z');
    const patch = reconcilePossibleEndClockColumns({
      state: TripDetectionState.POSSIBLE_END,
      possibleEndAt: null,
      possibleEndEnteredAt: null,
      lastEvidenceSummary: {
        stopBoundaryAt: '2026-09-10T20:01:15.000Z',
        stopBoundaryTrust: true,
        stopBoundarySource: 'provider_stationary_vls',
        endValidationScheduledAt: '2026-09-10T20:16:37.000Z',
      },
      workerNow,
    });
    expect(patch).toEqual({
      possibleEndAt: new Date('2026-09-10T20:01:15.000Z'),
    });
    expect(patch?.possibleEndEnteredAt).toBeUndefined();
  });
});
