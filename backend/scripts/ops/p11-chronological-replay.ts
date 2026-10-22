/**
 * P11 gate: chronological as-of replay on production GE CSV (read-only).
 * Usage: npx tsx backend/scripts/ops/p11-chronological-replay.ts /tmp/p12-ge-120d.csv
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

const VEHICLES: Record<string, { label: string; chem: 'AGM' | 'LEAD_ACID' }> = {
  '19fedd4b-c4e8-4de8-a125-dab293326e7e': { label: 'TIGUAN', chem: 'LEAD_ACID' },
  'c10351f8-b6a2-4258-947f-631aeaa6d359': { label: 'AUDI', chem: 'AGM' },
  '8c850ff1-4201-432b-af2e-2711dbc7ca48': { label: 'ARTEON', chem: 'AGM' },
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
  const latest = observations[observations.length - 1] ?? null;
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
      latestGlobalObservation: latest,
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
    const list = byVid.get(vid) ?? [];
    list.push(mapRow(row));
    byVid.set(vid, list);
  }
  for (const [vid, list] of byVid) {
    list.sort((a, b) => Date.parse(a.voltageObservedAt) - Date.parse(b.voltageObservedAt));
    byVid.set(vid, list);
  }
  return byVid;
}

function replayVehicle(label: string, vehicleId: string, all: LvOperationalConditionObservationV1[]) {
  const eligible = all.filter(isEligibleRestObservationForConditionV1);
  const sessionEnds: number[] = [];
  const seen = new Set<string>();
  for (const o of eligible) {
    const key = o.restSessionId ?? o.sourceMeasurementId;
    const t = Date.parse(o.voltageObservedAt);
    if (!seen.has(key)) {
      seen.add(key);
      sessionEnds.push(t);
    }
  }
  sessionEnds.sort((a, b) => a - b);
  const steps: number[] = [];
  for (let i = 0; i < sessionEnds.length; i += 1) {
    if (i % 2 === 0 || i === sessionEnds.length - 1) steps.push(sessionEnds[i]);
  }
  if (steps[steps.length - 1] !== Date.parse(all[all.length - 1].voltageObservedAt)) {
    steps.push(Date.parse(all[all.length - 1].voltageObservedAt));
  }

  const transitions: Array<{
    at: string;
    p1: string;
    p11: string;
    p11Rule: string | null;
    preStartExcluded: number;
    changed: boolean;
    reason: string;
  }> = [];
  let prevP11: string | null = null;
  let prevP1: string | null = null;

  for (const tMs of steps) {
    const evaluatedAtIso = new Date(tMs).toISOString();
    const slice = all.filter((o) => Date.parse(o.voltageObservedAt) <= tMs);
    if (slice.length < 10) continue;
    const input = buildInput(vehicleId, slice, evaluatedAtIso);
    const p1 = evaluateLvEstimatedBatteryHealthV1(input);
    const p11 = evaluateLvEstimatedBatteryHealthV1WithResearchPolicy(input, 'P11_CONDITION_POLICY_V2');
    const sel = selectP11EpisodeRepresentatives({
      eligibleRestObservations: slice.filter(isEligibleRestObservationForConditionV1),
      assessmentTimelineObservations: slice,
      evaluatedAtIso,
    });
    const changed = prevP11 != null && prevP11 !== p11.estimatedHealthStatus;
    let reason = '';
    if (changed) {
      reason = p11.decisionTrace.p11ShadowRuleId ?? '';
      if (p11.reasonCodes.includes('HEALTH_P11_PRE_START_WAKE_EXCLUDED')) reason += ';pre_start';
      if (p11.reasonCodes.includes('HEALTH_LONGITUDINAL_DECLINE_SUSPECTED')) reason += ';decline';
    }
    if (changed || prevP11 === null) {
      transitions.push({
        at: evaluatedAtIso,
        p1: p1.estimatedHealthStatus,
        p11: p11.estimatedHealthStatus,
        p11Rule: p11.decisionTrace.p11ShadowRuleId ?? null,
        preStartExcluded: sel.trace.sessionsPreStartSuspectOnly,
        changed: Boolean(changed),
        reason,
      });
    }
    prevP11 = p11.estimatedHealthStatus;
    prevP1 = p1.estimatedHealthStatus;
  }

  const flaps = transitions.filter((t) => t.changed).length;
  return { label, transitions, transitionCount: transitions.filter((t) => t.changed).length, flaps };
}

async function main(): Promise<void> {
  const csvPath = process.argv[2] ?? '/tmp/p12-ge-120d.csv';
  const byVid = await loadCsv(csvPath);
  const vehicles: Record<string, unknown> = {};
  const out = { csvPath, vehicles };
  for (const [vid, meta] of Object.entries(VEHICLES)) {
    const all = byVid.get(vid) ?? [];
    vehicles[meta.label] = replayVehicle(meta.label, vid, all);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
