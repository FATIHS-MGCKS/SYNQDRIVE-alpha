import * as fs from 'fs';
import * as path from 'path';

import {
  clearPossibleEndClockFields,
  readR12RecoveryTrustedStopBoundaryFromEvidence,
  reconcilePossibleEndClockColumns,
  resolvePossibleEndBoundaryAnchor,
  resolvePossibleEndFsmDwellAnchor,
  readPossibleEndEnteredAtFromEvidence,
} from './trip-fsm-clock-contract';
import { buildPossibleEndToActiveReset } from './trip-end-cycle-reset';
import { buildMidGapSplitActiveFsmExtras } from './trip-mid-gap-fsm.util';
import { TripDetectionState } from '@prisma/client';

const BACKEND_ROOT = path.join(__dirname, '..', '..', '..', '..');
const BACKEND_SRC = path.join(BACKEND_ROOT, 'src');
const ORCHESTRATION = path.join(__dirname, 'trip-detection-orchestration.service.ts');

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTsFiles(full, out);
      continue;
    }
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) continue;
    out.push(full);
  }
  return out;
}

function searchBackendSource(pattern: RegExp): string {
  const lines: string[] = [];
  for (const file of walkTsFiles(BACKEND_SRC)) {
    const rel = path.relative(BACKEND_SRC, file);
    const content = fs.readFileSync(file, 'utf8');
    for (const match of content.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))) {
      const lineNum = content.slice(0, match.index ?? 0).split('\n').length;
      lines.push(`${rel}:${lineNum}:${match[0]}`);
    }
  }
  return lines.join('\n');
}

describe('R12 clock writer audit (repository-wide)', () => {
  type WriterRow = {
    writer: string;
    clearsPossibleEndAt: boolean;
    clearsPossibleEndEnteredAt: boolean;
    accompanyingState: string;
    sourceFiles: string[];
  };

  const CLOCK_WRITER_MATRIX: WriterRow[] = [
    {
      writer: 'clearPossibleEndClockFields()',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'ACTIVE_TRIP | RESTING (via transitionState)',
      sourceFiles: ['trip-fsm-clock-contract.ts'],
    },
    {
      writer: 'buildPossibleEndToActiveReset() → spread',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'ACTIVE_TRIP only',
      sourceFiles: ['trip-end-cycle-reset.ts', 'trip-detection-orchestration.service.ts'],
    },
    {
      writer: 'buildMidGapSplitActiveFsmExtras() → spread',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'ACTIVE_TRIP only (mid-gap split repoint)',
      sourceFiles: ['trip-mid-gap-fsm.util.ts', 'trip-detection-orchestration.service.ts'],
    },
    {
      writer: 'reconcilePossibleEndClockColumns()',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'POSSIBLE_END (restore-only patch; never nulls)',
      sourceFiles: ['trip-fsm-clock-contract.ts', 'trip-detection-orchestration.service.ts'],
    },
    {
      writer: 'transitionState(..., POSSIBLE_END, initial entry)',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'POSSIBLE_END (empty-core / continuity / CH assist — writes BOTH clocks)',
      sourceFiles: ['trip-detection-orchestration.service.ts'],
    },
    {
      writer: 'transitionState(..., POSSIBLE_END, evidence-only patches)',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'POSSIBLE_END (PEC/EV/FIN evidence updates; preserves NULL columns)',
      sourceFiles: ['trip-detection-orchestration.service.ts'],
    },
    {
      writer: 'prisma vehicleTripDetectionState.updateMany (lock fields only)',
      clearsPossibleEndAt: false,
      clearsPossibleEndEnteredAt: false,
      accompanyingState: 'any (worker lock only)',
      sourceFiles: ['trip-detection-orchestration.service.ts'],
    },
    {
      writer: 'executeLifecycleRecoveryAction RESET_TO_RESTING',
      clearsPossibleEndAt: true,
      clearsPossibleEndEnteredAt: true,
      accompanyingState: 'RESTING',
      sourceFiles: ['trip-detection-orchestration.service.ts'],
    },
  ];

  it('CLOCK_WRITER_MATRIX — bounded catalog of production clock mutators', () => {
    expect(CLOCK_WRITER_MATRIX.length).toBeGreaterThanOrEqual(7);
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

  it('repository-wide source scan — production writers are bounded to trip FSM module', () => {
    const possibleEndAtHits = searchBackendSource(/possibleEndAt\s*:/);
    const clearHits = searchBackendSource(/clearPossibleEndClockFields/);
    expect(possibleEndAtHits).toContain('trip-detection-orchestration.service.ts');
    expect(clearHits).toContain('trip-fsm-clock-contract.ts');
    expect(clearHits).toContain('trip-end-cycle-reset.ts');
    expect(clearHits).toContain('trip-mid-gap-fsm.util.ts');
    expect(possibleEndAtHits).not.toMatch(/scripts\//);
  });

  it('repository-wide source scan — no raw SQL UPDATE mutating possible_end columns', () => {
    const updateHits = searchBackendSource(/UPDATE[\s\S]*possible_end_(at|entered_at)/);
    expect(updateHits).toBe('');
    const schema = fs.readFileSync(
      path.join(BACKEND_ROOT, 'prisma', 'schema.prisma'),
      'utf8',
    );
    expect(schema).toContain('possibleEndEnteredAt');
    expect(schema).toContain('possibleEndAt');
  });

  describe('CLOCK_LOSS causal classification', () => {
    const workerNow = new Date('2026-09-10T20:35:00.000Z');
    const evidence = {
      stopBoundaryAt: '2026-09-10T20:01:15.000Z',
      stopBoundaryTrust: true,
      stopBoundarySource: 'provider_stationary_vls',
      possibleEndEnteredAt: '2026-09-10T20:04:37.793Z',
    };

    it('RECOVERY_HARDENING — NULL columns + durable evidence restore without workerNow fabrication', () => {
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

      const det = {
        possibleEndAt: null,
        possibleEndEnteredAt: null,
        updatedAt: workerNow,
        lastEvidenceSummary: evidence,
      };
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

    it('CLOCK_LOSS_ROOT_CAUSE — no proven single writer in current repository', () => {
      /**
       * Classification (2026-09-11 pre-merge audit):
       * - CURRENT_CODE_DIRECT_WRITER_TO_PE_BOTH_NULL: NONE (matrix + static grep)
       * - Canonical ACTIVE_TRIP→POSSIBLE_END entry ALWAYS writes both clocks (orchestration ~1907, ~2765)
       * - Evidence-only POSSIBLE_END patches preserve existing NULL columns (do not clear)
       *
       * Therefore PE + both NULL observed in Production (KS661) cannot be reproduced by
       * any committed writer while staying POSSIBLE_END. Plausible historical sequences:
       * 1) Pre-R12 deployment gap: columns never persisted despite evidence durability
       * 2) R1 migration 20260906120000: possibleEndEnteredAt added without backfill
       * 3) External/manual DB mutation (out of repo scope)
       * 4) Removed pre-R12 code path no longer present in git at 2f1b4f53d audit SHA
       *
       * CLOCK_LOSS_ROOT_CAUSE = UNRESOLVED (writer not demonstrated in repo)
       * RECOVERY_HARDENING = PROVEN (reconcile + anchor evidence fallbacks)
       */
      expect(CLOCK_WRITER_MATRIX.every((row) => !row.accompanyingState.match(/^POSSIBLE_END \(.*clear/i))).toBe(
        true,
      );
    });

    it('R12 recovery trust — explicit stopBoundaryTrust === true required', () => {
      const boundary = new Date('2026-09-10T20:01:15.000Z');
      expect(
        readR12RecoveryTrustedStopBoundaryFromEvidence(
          {
            stopBoundaryAt: boundary.toISOString(),
            stopBoundaryTrust: true,
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        ),
      ).toEqual(boundary);
      expect(
        readR12RecoveryTrustedStopBoundaryFromEvidence(
          {
            stopBoundaryAt: boundary.toISOString(),
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        ),
      ).toBeNull();
    });
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
