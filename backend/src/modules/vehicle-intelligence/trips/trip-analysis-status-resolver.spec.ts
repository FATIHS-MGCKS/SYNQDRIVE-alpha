import {
  mirrorResolvedStatusToLegacy,
  resolveTripAnalysisStatus,
} from './trip-analysis-status-resolver';
import type { AnalysisAssessabilityContext } from './trip-analysis-status';
import type {
  TripAnalysisStageKey,
  TripAnalysisStageRuntimeState,
  TripAnalysisStageSnapshot,
} from './trip-analysis-status-resolver.types';

function stages(
  overrides: Partial<TripAnalysisStageSnapshot> = {},
): TripAnalysisStageSnapshot {
  return {
    behavior: 'not_started',
    nativeEvents: 'not_started',
    route: 'not_started',
    eventContext: 'not_started',
    drivingImpact: 'not_started',
    misuse: 'not_started',
    attribution: 'not_started',
    ...overrides,
  };
}

const fullAssess: AnalysisAssessabilityContext = {
  analysisAssessability: 'FULL',
  analysisLimitReason: null,
  shortTermMisuseAssessable: true,
  nativeBehaviorEventsAvailable: true,
  hfInsufficientForAbuse: false,
};

const notAssessableAssess: AnalysisAssessabilityContext = {
  analysisAssessability: 'NOT_ASSESSABLE',
  analysisLimitReason: 'INSUFFICIENT_HF',
  shortTermMisuseAssessable: false,
  nativeBehaviorEventsAvailable: false,
  hfInsufficientForAbuse: true,
};

function resolve(
  stageOverrides: Partial<TripAnalysisStageSnapshot>,
  options?: {
    assessability?: AnalysisAssessabilityContext;
    analysisQueued?: boolean;
  },
) {
  return resolveTripAnalysisStatus({
    stages: stages(stageOverrides),
    assessability: options?.assessability ?? fullAssess,
    analysisQueued: options?.analysisQueued,
  });
}

describe('TripAnalysisStatusResolver', () => {
  describe('mirrorResolvedStatusToLegacy', () => {
    it.each([
      ['NOT_STARTED', 'PENDING'],
      ['NOT_ASSESSABLE', 'SKIPPED'],
      ['IN_PROGRESS', 'IN_PROGRESS'],
      ['PARTIAL', 'PARTIAL'],
      ['COMPLETED', 'COMPLETED'],
      ['FAILED', 'FAILED'],
      ['SKIPPED', 'SKIPPED'],
    ] as const)('maps %s → %s', (resolved, legacy) => {
      expect(mirrorResolvedStatusToLegacy(resolved)).toBe(legacy);
    });
  });

  describe('NOT_STARTED', () => {
    it('returns NOT_STARTED when analysis was never queued and no stage started', () => {
      const result = resolve({}, { analysisQueued: false });
      expect(result.status).toBe('NOT_STARTED');
      expect(result.legacyTripAnalysisStatus).toBe('PENDING');
      expect(result.hasUsablePartialResults).toBe(false);
    });

    it('does not return NOT_STARTED once analysis is queued even if stages are pending', () => {
      const result = resolve(
        {
          behavior: 'pending',
          route: 'pending',
          misuse: 'pending',
          drivingImpact: 'pending',
        },
        { analysisQueued: true },
      );
      expect(result.status).toBe('IN_PROGRESS');
    });
  });

  describe('FAILED', () => {
    it('returns FAILED when behavior stage failed regardless of other stages', () => {
      const result = resolve({
        behavior: 'failed',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
      });
      expect(result.status).toBe('FAILED');
      expect(result.legacyTripAnalysisStatus).toBe('FAILED');
      expect(result.failedStages).toEqual(['behavior']);
    });
  });

  describe('COMPLETED', () => {
    const completedRequired: Partial<TripAnalysisStageSnapshot> = {
      behavior: 'done',
      route: 'done',
      misuse: 'done',
      drivingImpact: 'done',
    };

    it('returns COMPLETED when all required stages are successful terminals', () => {
      const result = resolve({
        ...completedRequired,
        nativeEvents: 'not_started',
        eventContext: 'not_started',
        attribution: 'not_started',
      });
      expect(result.status).toBe('COMPLETED');
      expect(result.legacyTripAnalysisStatus).toBe('COMPLETED');
      expect(result.hasUsablePartialResults).toBe(true);
    });

    it('returns COMPLETED when required stages use skipped/not_required terminals', () => {
      const result = resolve({
        behavior: 'done',
        route: 'skipped',
        misuse: 'skipped',
        drivingImpact: 'skipped',
        nativeEvents: 'done',
        eventContext: 'skipped',
        attribution: 'not_started',
      });
      expect(result.status).toBe('COMPLETED');
    });

    it('does not return COMPLETED while any required stage is still pending', () => {
      const result = resolve({
        behavior: 'done',
        route: 'done',
        misuse: 'pending',
        drivingImpact: 'done',
      });
      expect(result.status).not.toBe('COMPLETED');
      expect(result.pendingStages).toContain('misuse');
    });
  });

  describe('PARTIAL', () => {
    it('returns PARTIAL when behavior is done but a non-critical stage failed', () => {
      const result = resolve({
        behavior: 'done',
        route: 'failed',
        misuse: 'done',
        drivingImpact: 'done',
      });
      expect(result.status).toBe('PARTIAL');
      expect(result.legacyTripAnalysisStatus).toBe('PARTIAL');
      expect(result.hasUsablePartialResults).toBe(true);
      expect(result.failedStages).toEqual(['route']);
    });

    it('returns PARTIAL when misuse failed but behavior succeeded', () => {
      const result = resolve({
        behavior: 'done',
        route: 'done',
        misuse: 'failed',
        drivingImpact: 'skipped',
      });
      expect(result.status).toBe('PARTIAL');
    });

    it('returns PARTIAL when behavior is done but downstream stages are still pending', () => {
      const result = resolve({
        behavior: 'done',
        route: 'done',
        misuse: 'pending',
        drivingImpact: 'pending',
      });
      expect(result.status).toBe('PARTIAL');
      expect(result.pendingStages).toEqual(
        expect.arrayContaining(['misuse', 'drivingImpact']),
      );
    });

    it('returns PARTIAL when optional nativeEvents stage failed', () => {
      const result = resolve({
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
        nativeEvents: 'failed',
      });
      expect(result.status).toBe('PARTIAL');
      expect(result.failedStages).toContain('nativeEvents');
    });

    it('returns PARTIAL when optional attribution stage failed', () => {
      const result = resolve({
        behavior: 'done',
        route: 'done',
        misuse: 'done',
        drivingImpact: 'done',
        attribution: 'failed',
      });
      expect(result.status).toBe('PARTIAL');
    });
  });

  describe('IN_PROGRESS', () => {
    it('returns IN_PROGRESS while behavior is still pending', () => {
      const result = resolve({
        behavior: 'pending',
        route: 'pending',
        misuse: 'pending',
        drivingImpact: 'pending',
      });
      expect(result.status).toBe('IN_PROGRESS');
      expect(result.pendingStages.length).toBeGreaterThan(0);
    });

    it('returns IN_PROGRESS when behavior skipped but required route still pending', () => {
      const result = resolve({
        behavior: 'skipped',
        route: 'pending',
        misuse: 'skipped',
        drivingImpact: 'skipped',
      });
      expect(result.status).toBe('IN_PROGRESS');
    });
  });

  describe('SKIPPED and NOT_ASSESSABLE', () => {
    it('returns NOT_ASSESSABLE when fully not assessable and behavior capability-skipped', () => {
      const result = resolve(
        {
          behavior: 'skipped',
          route: 'skipped',
          misuse: 'skipped',
          drivingImpact: 'skipped',
        },
        { assessability: notAssessableAssess, analysisQueued: true },
      );
      expect(result.status).toBe('NOT_ASSESSABLE');
      expect(result.legacyTripAnalysisStatus).toBe('SKIPPED');
      expect(result.hasUsablePartialResults).toBe(false);
    });

    it('returns NOT_ASSESSABLE when capability skip without full-skip assessability flag', () => {
      const limitedNoData: AnalysisAssessabilityContext = {
        analysisAssessability: 'NOT_ASSESSABLE',
        analysisLimitReason: 'CAPABILITY',
        shortTermMisuseAssessable: false,
        nativeBehaviorEventsAvailable: false,
        hfInsufficientForAbuse: false,
      };
      const result = resolve(
        {
          behavior: 'skipped',
          route: 'skipped',
          misuse: 'skipped',
          drivingImpact: 'skipped',
        },
        { assessability: limitedNoData, analysisQueued: true },
      );
      expect(result.status).toBe('NOT_ASSESSABLE');
      expect(result.legacyTripAnalysisStatus).toBe('SKIPPED');
    });
  });

  describe('non-critical failure does not invalidate successful outputs', () => {
    const nonCriticalStages: TripAnalysisStageKey[] = [
      'nativeEvents',
      'route',
      'eventContext',
      'drivingImpact',
      'misuse',
      'attribution',
    ];

    it.each(nonCriticalStages)(
      'keeps behavior done usable when %s fails',
      (failedStage) => {
        const stageStates: Partial<TripAnalysisStageSnapshot> = {
          behavior: 'done',
          route: 'done',
          misuse: 'done',
          drivingImpact: 'done',
        };
        stageStates[failedStage] = 'failed';
        const result = resolve(stageStates);
        expect(result.status).not.toBe('FAILED');
        expect(result.hasUsablePartialResults).toBe(true);
      },
    );
  });

  describe('stage state matrix', () => {
    const terminalSuccess: TripAnalysisStageRuntimeState[] = ['done', 'skipped', 'not_required'];

    it.each(terminalSuccess)(
      'behavior=%s with all required terminals → COMPLETED or PARTIAL, never FAILED',
      (behaviorState) => {
        const result = resolve({
          behavior: behaviorState === 'not_required' ? 'done' : behaviorState,
          route: 'done',
          misuse: 'done',
          drivingImpact: 'done',
        });
        expect(result.status).not.toBe('FAILED');
      },
    );
  });
});
