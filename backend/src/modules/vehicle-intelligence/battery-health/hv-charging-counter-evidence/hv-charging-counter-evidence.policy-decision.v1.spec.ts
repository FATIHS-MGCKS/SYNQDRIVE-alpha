import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { evaluateHvChargingCounterQualityV2 } from './hv-charging-counter-evidence.counter-quality.v2';
import {
  evaluateHvR22PolicyDecisionV1,
  HV_R22_POLICY_DECISION_SCHEMA_V1,
  HV_R22_POLICY_EVALUATOR_VERSION_V1,
  HV_R22_POLICY_REASON_CODE_ORDER_V1,
} from './hv-charging-counter-evidence.policy-decision.v1';
import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

function row(
  timestamp: string,
  last: number | null,
): HvChargingCounterDimoIntervalRowV1 {
  return { timestamp, addedKwhLast: last };
}

function qualityAndPolicy(input: {
  sessionStartInclusive: string;
  sessionEndInclusive: string;
  queryFromInclusive: string;
  queryToInclusive: string;
  rows: HvChargingCounterDimoIntervalRowV1[];
  overlapAssessed?: boolean;
  overlapRiskCleared?: boolean;
  sessionBoundariesValid?: boolean;
}) {
  const counterQuality = evaluateHvChargingCounterQualityV2(input);
  const policyDecision = evaluateHvR22PolicyDecisionV1({
    counterQuality,
    overlapAssessed: input.overlapAssessed ?? false,
    overlapRiskCleared: input.overlapRiskCleared,
    sessionBoundariesValid: input.sessionBoundariesValid,
  });
  return { counterQuality, policyDecision };
}

function loadP1dSparseFixture() {
  const path = join(__dirname, 'fixtures', 'p1d-research', 'p1d-tesla-pilot-sparse-115.json');
  return JSON.parse(readFileSync(path, 'utf8')) as {
    sessionWindow: { from: string; to: string };
    queryWindow: { from: string; to: string };
    rows: HvChargingCounterDimoIntervalRowV1[];
  };
}

describe('evaluateHvR22PolicyDecisionV1', () => {
  it('defaults energyUseEligible to false when overlap is not assessed', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', 1), row('2026-10-12T13:07:00Z', 2), row('2026-10-12T13:08:00Z', 3)],
    });
    expect(policyDecision.energyUseEligible).toBe(false);
    expect(policyDecision.reasonCodes).toContain('OVERLAP_NOT_ASSESSED');
  });

  it('allows energyUseEligible only with complete temporal grid and cleared overlap', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', 1), row('2026-10-12T13:07:00Z', 2), row('2026-10-12T13:08:00Z', 3)],
      overlapAssessed: true,
      overlapRiskCleared: true,
    });
    expect(policyDecision).toEqual({
      schemaVersion: HV_R22_POLICY_DECISION_SCHEMA_V1,
      evaluatorVersion: HV_R22_POLICY_EVALUATOR_VERSION_V1,
      shadowEvidenceAcceptable: true,
      energyUseEligible: true,
      reasonCodes: [],
    });
  });

  it('flags missing minute slots (P1C-class sparse) — shadow acceptable, energy ineligible', () => {
    const fixture = loadP1dSparseFixture();
    const { counterQuality, policyDecision } = qualityAndPolicy({
      sessionStartInclusive: fixture.sessionWindow.from,
      sessionEndInclusive: fixture.sessionWindow.to,
      queryFromInclusive: fixture.queryWindow.from,
      queryToInclusive: fixture.queryWindow.to,
      rows: fixture.rows,
    });
    expect(counterQuality.reliableSessionCounterDelta).toBe(true);
    expect(policyDecision.shadowEvidenceAcceptable).toBe(true);
    expect(policyDecision.energyUseEligible).toBe(false);
    expect(policyDecision.reasonCodes).toEqual(
      expect.arrayContaining([
        'TEMPORAL_GRID_INCOMPLETE',
        'LONG_GAP_PRESENT',
        'OVERLAP_NOT_ASSESSED',
      ]),
    );
  });

  it('detects long temporal gaps without complete grid', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:16:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:16:00Z',
      rows: [row('2026-10-12T13:06:00Z', 1), row('2026-10-12T13:16:00Z', 5)],
    });
    expect(policyDecision.energyUseEligible).toBe(false);
    expect(policyDecision.reasonCodes).toContain('LONG_GAP_PRESENT');
    expect(policyDecision.reasonCodes).toContain('TEMPORAL_GRID_INCOMPLETE');
  });

  it('rejects boundary uncertainty', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', null), row('2026-10-12T13:07:00Z', null)],
    });
    expect(policyDecision.shadowEvidenceAcceptable).toBe(false);
    expect(policyDecision.reasonCodes).toContain('BOUNDARY_UNCERTAIN');
    expect(policyDecision.reasonCodes).toContain('NUMERIC_EVIDENCE_INCOMPLETE');
  });

  it('rejects counter reset candidates', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:05:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [
        row('2026-10-12T13:05:00Z', 10),
        row('2026-10-12T13:06:00Z', 0.5),
        row('2026-10-12T13:07:00Z', 1),
        row('2026-10-12T13:08:00Z', 2),
      ],
    });
    expect(policyDecision.shadowEvidenceAcceptable).toBe(false);
    expect(policyDecision.reasonCodes).toContain('COUNTER_RESET_DETECTED');
  });

  it('rejects negative deltas', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', 3), row('2026-10-12T13:07:00Z', 2), row('2026-10-12T13:08:00Z', 4)],
    });
    expect(policyDecision.shadowEvidenceAcceptable).toBe(false);
    expect(policyDecision.reasonCodes).toContain('NEGATIVE_DELTA_PRESENT');
  });

  it('rejects null LAST numeric incompleteness', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', 1), row('2026-10-12T13:07:00Z', null), row('2026-10-12T13:08:00Z', 3)],
    });
    expect(policyDecision.reasonCodes).toContain('NUMERIC_EVIDENCE_INCOMPLETE');
  });

  it('fails closed on missing evidence', () => {
    const policyDecision = evaluateHvR22PolicyDecisionV1({
      counterQuality: null,
      overlapAssessed: false,
    });
    expect(policyDecision).toMatchObject({
      shadowEvidenceAcceptable: false,
      energyUseEligible: false,
      reasonCodes: ['EVIDENCE_MISSING'],
    });
  });

  it('fails closed on invalid session boundaries flag', () => {
    const { counterQuality } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', 1), row('2026-10-12T13:07:00Z', 2), row('2026-10-12T13:08:00Z', 3)],
      overlapAssessed: true,
      overlapRiskCleared: true,
    });
    const policyDecision = evaluateHvR22PolicyDecisionV1({
      counterQuality: counterQuality,
      overlapAssessed: true,
      overlapRiskCleared: true,
      sessionBoundariesValid: false,
    });
    expect(policyDecision.shadowEvidenceAcceptable).toBe(false);
    expect(policyDecision.energyUseEligible).toBe(false);
    expect(policyDecision.reasonCodes).toContain('INVALID_SESSION_BOUNDARIES');
  });

  it('fails energy when overlap assessed but not cleared', () => {
    const { counterQuality } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:08:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:08:00Z',
      rows: [row('2026-10-12T13:06:00Z', 1), row('2026-10-12T13:07:00Z', 2), row('2026-10-12T13:08:00Z', 3)],
    });
    const policyDecision = evaluateHvR22PolicyDecisionV1({
      counterQuality,
      overlapAssessed: true,
      overlapRiskCleared: false,
    });
    expect(policyDecision.energyUseEligible).toBe(false);
    expect(policyDecision.reasonCodes).toContain('OVERLAP_RISK_PRESENT');
  });

  it('does not mutate v2 counter-quality output', () => {
    const input = {
      sessionStartInclusive: '2026-10-12T13:06:55.314Z',
      sessionEndInclusive: '2026-10-12T15:10:30.313Z',
      queryFromInclusive: '2026-10-12T13:06:55.314Z',
      queryToInclusive: '2026-10-12T15:10:30.313Z',
      rows: loadP1dSparseFixture().rows,
    };
    const before = evaluateHvChargingCounterQualityV2(input);
    const beforeJson = JSON.stringify(before);
    evaluateHvR22PolicyDecisionV1({ counterQuality: before, overlapAssessed: false });
    const after = evaluateHvChargingCounterQualityV2(input);
    expect(JSON.stringify(after)).toBe(beforeJson);
  });

  const p1eExportPath = '/opt/cursor/artifacts/p1f-batch-p1e.json';
  if (existsSync(p1eExportPath)) {
    it('P1E production export — shadow acceptable, energy ineligible (real evidence)', () => {
      const bundle = JSON.parse(readFileSync(p1eExportPath, 'utf8')) as {
        batch: {
          segment_start_at: string;
          segment_end_at: string;
          query_window_from: string;
          query_window_to: string;
        };
        observations: { bucket_start_at: string; value_kwh: number }[];
      };
      const rows = bundle.observations.map((o) => ({
        timestamp: o.bucket_start_at,
        addedKwhLast: o.value_kwh,
      }));
      const { counterQuality, policyDecision } = qualityAndPolicy({
        sessionStartInclusive: new Date(bundle.batch.segment_start_at).toISOString(),
        sessionEndInclusive: new Date(bundle.batch.segment_end_at).toISOString(),
        queryFromInclusive: new Date(bundle.batch.query_window_from).toISOString(),
        queryToInclusive: new Date(bundle.batch.query_window_to).toISOString(),
        rows,
      });
      expect(counterQuality.reliableSessionCounterDelta).toBe(true);
      expect(policyDecision.shadowEvidenceAcceptable).toBe(true);
      expect(policyDecision.energyUseEligible).toBe(false);
      expect(policyDecision.reasonCodes).toContain('OVERLAP_NOT_ASSESSED');
      expect(policyDecision.reasonCodes).toContain('TEMPORAL_GRID_INCOMPLETE');
    });
  }

  const sep18Path = join(
    '/opt/cursor/artifacts/hv-r22-p1b-sessions',
    'ad282bd3-dimo-response.json',
  );
  if (existsSync(sep18Path)) {
    it('Sep-18 overlapping session ad282bd3 — shadow and energy rejected (real P1B capture)', () => {
      const art = JSON.parse(readFileSync(sep18Path, 'utf8')) as {
        sessionWindow: { from: string; to: string };
        queryWindow: { from: string; to: string };
        rows: HvChargingCounterDimoIntervalRowV1[];
      };
      const { policyDecision } = qualityAndPolicy({
        sessionStartInclusive: art.sessionWindow.from,
        sessionEndInclusive: art.sessionWindow.to,
        queryFromInclusive: art.queryWindow.from,
        queryToInclusive: art.queryWindow.to,
        rows: art.rows,
      });
      expect(policyDecision.shadowEvidenceAcceptable).toBe(false);
      expect(policyDecision.energyUseEligible).toBe(false);
      expect(policyDecision.reasonCodes).toEqual(
        expect.arrayContaining(['NEGATIVE_DELTA_PRESENT', 'COUNTER_RESET_DETECTED']),
      );
    });
  } else {
    it('Sep-18 overlapping class — SYNTHETIC negative delta + reset', () => {
      const { policyDecision } = qualityAndPolicy({
        sessionStartInclusive: '2026-09-18T17:33:50.599Z',
        sessionEndInclusive: '2026-09-18T19:53:26.599Z',
        queryFromInclusive: '2026-09-18T17:28:50.599Z',
        queryToInclusive: '2026-09-18T19:58:26.599Z',
        rows: [
          row('2026-09-18T17:31:50.599Z', 8),
          row('2026-09-18T17:33:50.599Z', 1),
          row('2026-09-18T19:53:50.599Z', 7),
        ],
      });
      expect(policyDecision.shadowEvidenceAcceptable).toBe(false);
      expect(policyDecision.energyUseEligible).toBe(false);
    });
  }

  it('returns deterministic sorted reason codes', () => {
    const { policyDecision } = qualityAndPolicy({
      sessionStartInclusive: '2026-10-12T13:06:00Z',
      sessionEndInclusive: '2026-10-12T13:16:00Z',
      queryFromInclusive: '2026-10-12T13:06:00Z',
      queryToInclusive: '2026-10-12T13:16:00Z',
      rows: [row('2026-10-12T13:06:00Z', null), row('2026-10-12T13:16:00Z', 2)],
    });
    const codes = policyDecision.reasonCodes;
    for (let i = 1; i < codes.length; i++) {
      expect(HV_R22_POLICY_REASON_CODE_ORDER_V1.indexOf(codes[i])).toBeGreaterThan(
        HV_R22_POLICY_REASON_CODE_ORDER_V1.indexOf(codes[i - 1]),
      );
    }
  });
});
