/**
 * P12: P1 vs P11 on unmodified production GE CSV (no synthetic timeline).
 * Usage: npx tsx backend/scripts/ops/p12-p11-real-evidence-offline.ts /tmp/p12-ge-120d.csv
 */
import * as fs from 'fs';
import * as readline from 'readline';
import { mapEvidenceClassToOperationalContext } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-measured-intelligence/lv-measured-intelligence-context.policy';
import { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import {
  evaluateLvEstimatedBatteryHealthV1,
  evaluateLvEstimatedBatteryHealthV1WithResearchPolicy,
} from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.evaluator';
import type { LvEstimatedBatteryHealthInputV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-v1.types';
import type { LvOperationalConditionObservationV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-v1.types';
import { isEligibleRestObservationForConditionV1 } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-observation.policy';
import { LV_OPERATIONAL_CONDITION_MODEL_VERSION } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-v1.constants';
import { selectP11EpisodeRepresentatives } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-estimated-battery-health/lv-estimated-battery-health-p11-episode.policy';
import { selectEpisodeRepresentativesForOperationalRisk } from '../../src/modules/vehicle-intelligence/battery-health/generalized-evidence/lv-operational-condition/lv-operational-condition-observation.policy';

const VEHICLES: Record<string, { label: string; chem: 'AGM' | 'LEAD_ACID'; gap: number }> = {
  '19fedd4b-c4e8-4de8-a125-dab293326e7e': { label: 'TIGUAN', chem: 'LEAD_ACID', gap: 0 },
  'c10351f8-b6a2-4258-947f-631aeaa6d359': { label: 'AUDI', chem: 'AGM', gap: 1 },
  '8c850ff1-4201-432b-af2e-2711dbc7ca48': { label: 'ARTEON', chem: 'AGM', gap: 0 },
};

type CsvRow = Record<string, string>;

function parseCsvLine(header: string[], line: string): CsvRow {
  const parts: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      parts.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  const row: CsvRow = {};
  header.forEach((h, i) => {
    row[h] = parts[i] ?? '';
  });
  return row;
}

function mapRow(row: CsvRow): LvOperationalConditionObservationV1 {
  const evidenceClass = row.evidence_class as BatteryGeneralizedEvidenceClass;
  const isLvCharging = row.is_lv_charging === 't' || row.is_lv_charging === 'true';
  return {
    observationId: row.id,
    sourceMeasurementId: row.source_measurement_id,
    restSessionId: row.rest_session_id || null,
    voltageV: Number(row.voltage),
    voltageObservedAt: new Date(row.voltage_observed_at).toISOString(),
    providerObservationAt: row.provider_observation_at
      ? new Date(row.provider_observation_at).toISOString()
      : null,
    operationalContext: mapEvidenceClassToOperationalContext(evidenceClass, isLvCharging),
    evidenceClass: row.evidence_class,
    actualRestAgeHours:
      row.actual_rest_age_ms && row.actual_rest_age_ms !== ''
        ? Number(row.actual_rest_age_ms) / (3600 * 1000)
        : null,
    temperatureC: null,
    isLvCharging,
    engineRunning: row.engine_running === 't' || row.engine_running === 'true',
  };
}

function buildInput(
  vehicleId: string,
  observations: LvOperationalConditionObservationV1[],
  evaluatedAtIso: string,
): LvEstimatedBatteryHealthInputV1 {
  const meta = VEHICLES[vehicleId];
  const eligible = observations.filter(isEligibleRestObservationForConditionV1);
  return {
    restoreCutoffIso: '2026-10-17T21:55:43.000Z',
    postRestoreObservationCount: observations.length,
    conditionInput: {
      modelVersion: LV_OPERATIONAL_CONDITION_MODEL_VERSION,
      organizationId: 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
      vehicleId,
      evaluatedAtIso,
      chemistry: {
        normalizedType: meta.chem,
        batterySpecId: 'prod-ro',
        sourceType: 'MANUAL',
        sourceConfidence: 1,
        nominalVoltageV: 12,
        ampereHours: 70,
        authority: 'VEHICLE_BATTERY_SPEC',
        restingThresholdAuthority: 'BATTERY_STATUS_CLASSIFY_RESTING_VOLTAGE_V1',
      },
      openProviderObservabilityGapCount: meta.label === 'AUDI' ? 1 : 0,
      historicalQueryMode: 'RECENT_DESC_LIMIT',
      inputCoverageIncomplete: false,
      historicalObservationsTruncated: false,
      geDataSelection: {
        rawVoltageRowCount: observations.length,
        dedupedVoltageRowCount: observations.length,
        eligibleRestObservationCount: eligible.length,
        measuredFromIso: observations[0]?.voltageObservedAt ?? null,
        measuredToIso: observations[observations.length - 1]?.voltageObservedAt ?? null,
      },
      eligibleRestObservations: eligible,
      assessmentTimelineObservations: observations,
      latestGlobalObservation: observations[observations.length - 1] ?? null,
      latestEligibleRestObservation: eligible[eligible.length - 1] ?? null,
      wakeVoltageObservations: [],
      sessionFeatures: [],
      crankEvidence: {
        source: 'BATTERY_FEATURES',
        crankTripId: null,
        crankAtIso: '2026-07-16T08:00:00.000Z',
        vPreCrankV: null,
        vMinCrankV: meta.label === 'AUDI' ? 13.087 : null,
        crankDropV: null,
        vRecovery5sV: null,
        vRecovery30sV: null,
        crankObservationCount: meta.label === 'AUDI' ? 8 : 5,
      },
    },
  };
}

async function loadCsv(path: string): Promise<Map<string, LvOperationalConditionObservationV1[]>> {
  const byVid = new Map<string, LvOperationalConditionObservationV1[]>();
  const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
  let header: string[] = [];
  for await (const line of rl) {
    if (!header.length) {
      header = line.split(',');
      continue;
    }
    const row = parseCsvLine(header, line);
    const vid = row.vehicle_id;
    if (!VEHICLES[vid]) continue;
    const obs = mapRow(row);
    const list = byVid.get(vid) ?? [];
    list.push(obs);
    byVid.set(vid, list);
  }
  for (const [vid, list] of byVid) {
    list.sort((a, b) => Date.parse(a.voltageObservedAt) - Date.parse(b.voltageObservedAt));
    byVid.set(vid, list);
  }
  return byVid;
}

async function main(): Promise<void> {
  const csvPath = process.argv[2] ?? '/tmp/p12-ge-120d.csv';
  const byVid = await loadCsv(csvPath);
  const evaluatedAtIso = new Date().toISOString();
  const vehicles: Record<string, unknown> = {};
  const out: {
    productionSha: string;
    syntheticTimeline: boolean;
    evaluatedAtIso: string;
    vehicles: Record<string, unknown>;
    p11Deterministic?: boolean;
  } = {
    productionSha: 'feab323bbc8c63b2fe886fa8772ff28846d0b3d3',
    syntheticTimeline: false,
    evaluatedAtIso,
    vehicles,
  };

  for (const [vid, meta] of Object.entries(VEHICLES)) {
    const observations = byVid.get(vid) ?? [];
    const input = buildInput(vid, observations, evaluatedAtIso);
    const p1 = evaluateLvEstimatedBatteryHealthV1(input);
    const p11 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(input, 'P11_CONDITION_POLICY_V2');
    const eligible = input.conditionInput.eligibleRestObservations;
    const p1Eps = selectEpisodeRepresentativesForOperationalRisk(eligible);
    const p11Sel = selectP11EpisodeRepresentatives({
      eligibleRestObservations: eligible,
      assessmentTimelineObservations: observations,
    });
    vehicles[meta.label] = {
      observationCount: observations.length,
      p1: {
        status: p1.estimatedHealthStatus,
        ruleId: p1.decisionTrace.finalRuleId,
        episodeCount: p1Eps.length,
        reasonCodes: p1.reasonCodes.filter((c) => c.startsWith('HEALTH_') && !c.includes('EPISODES')),
      },
      p11: {
        status: p11.estimatedHealthStatus,
        ruleId: p11.decisionTrace.p11ShadowRuleId,
        trend: p11.decisionTrace.p11LongitudinalTrend,
        episodeCount: p11Sel.episodes.length,
        selectionTrace: p11Sel.trace,
        preStartExcludedSessions: p11Sel.trace.sessionsPreStartSuspectOnly,
        reasonCodes: p11.reasonCodes.filter((c) =>
          c.startsWith('HEALTH_P11') || c.startsWith('HEALTH_REST') || c.startsWith('HEALTH_LONGITUDINAL'),
        ),
      },
      statusChanged: p1.estimatedHealthStatus !== p11.estimatedHealthStatus,
    };
  }

  // Determinism check
  const vid = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
  const obs = byVid.get(vid) ?? [];
  const in1 = buildInput(vid, obs, evaluatedAtIso);
  const in2 = buildInput(vid, obs, evaluatedAtIso);
  const a = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(in1, 'P11_CONDITION_POLICY_V2');
  const b = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(in2, 'P11_CONDITION_POLICY_V2');
  out.p11Deterministic = a.estimatedHealthStatus === b.estimatedHealthStatus && a.decisionTrace.p11ShadowRuleId === b.decisionTrace.p11ShadowRuleId;

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
