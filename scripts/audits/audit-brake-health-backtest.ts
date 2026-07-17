#!/usr/bin/env ts-node
/**
 * Brake Health Historical Backtest — read-only, as-of semantics.
 *
 * Validates BRAKE_HEALTH V1 wear-model predictions against verified manual /
 * workshop / confirmed-document thickness measurements. NO recalculate(),
 * NO calibration writes, NO production mutations.
 *
 * Usage (supervised production):
 *   cd backend && BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-brake-health-backtest.ts \
 *     --output-dir=../docs/audits/data
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const scriptDir = path.resolve(path.dirname(process.argv[1] ?? '.'));
const backendRoot = path.resolve(scriptDir, '..', '..', 'backend');
const requireFromBackend = createRequire(path.join(backendRoot, 'package.json'));

const { BRAKE_HEALTH_CONFIG } = requireFromBackend(
  './dist/src/modules/vehicle-intelligence/brakes/brake-health.config.js',
);
const {
  classifyMeasuredThickness,
} = requireFromBackend('./dist/src/modules/vehicle-intelligence/brakes/brake-status.js');

const AUDIT_ID = 'brake-health-backtest-2026-07';
const MODEL_VERSION = BRAKE_HEALTH_CONFIG.MODEL_VERSION ?? '1.0.0';

type GroundTruthClass =
  | 'TRUE_PAD_MEASUREMENT'
  | 'TRUE_DISC_MEASUREMENT'
  | 'CONFIRMED_REPLACEMENT'
  | 'DOCUMENTED_CONDITION_ONLY'
  | 'SPEC_ONLY'
  | 'AI_UNCONFIRMED'
  | 'ESTIMATION_ONLY'
  | 'UNKNOWN';

type Component = 'pad' | 'disc';
type Axle = 'front' | 'rear';

interface CandidateRow {
  anonId: string;
  vehicleId: string;
  recordId: string;
  recordType: string;
  timestamp: string;
  source: string;
  axle: Axle | 'unknown';
  component: Component | 'both' | 'unknown';
  valueMm: number | null;
  odometerKm: number | null;
  confidence: string | null;
  classification: GroundTruthClass;
  exclusionFromBacktest: string;
  notes: string;
}

interface BacktestRow {
  anonymizedVehicleId: string;
  component: Component;
  axle: Axle;
  anchorTimestamp: string;
  anchorSource: string;
  anchorMm: number | string;
  targetMeasurementTimestamp: string;
  targetSource: string;
  predictedMm: string | number;
  measuredMm: number;
  signedErrorMm: string | number;
  absoluteErrorMm: string | number;
  predictedCondition: string;
  actualCondition: string;
  confidence: string;
  coverage: string | number;
  modelingSource: string;
  kFactor: number;
  modelVersion: string;
  reproducible: boolean;
  exclusionReason: string;
  powertrain: string;
  brakeBiasSource: string;
  calibrationCount: number;
  tripCountBeforeTarget: number;
  distanceKmModeled: number;
}

interface ConfidenceMatrixRow {
  scenario: string;
  dataBasis: string;
  expectedConfidence: string;
  canReachHigh: boolean;
  codeEvidence: string;
  fleetValidated: boolean;
  finding: string;
}

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function psqlUrl(): string {
  const envPath = path.join(backendRoot, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)\s*$/);
      if (m && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = m[1].replace(/^"(.*)"$/, '$1');
      }
    }
  }
  const url = process.env.DATABASE_URL?.split('?')[0];
  if (!url) throw new Error('DATABASE_URL required');
  return url;
}

function runPsql(sql: string): string {
  return execFileSync('psql', [psqlUrl(), '-v', 'ON_ERROR_STOP=1', '-At', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function csvEscape(v: string | number | boolean | null | undefined): string {
  const s = v == null ? '' : String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(filePath: string, rows: Array<Record<string, string | number | boolean | null>>): void {
  const header = rows.length > 0 ? Object.keys(rows[0]) : [];
  const lines = [header.join(','), ...rows.map((r) => header.map((h) => csvEscape(r[h])).join(','))];
  fs.writeFileSync(filePath, lines.join('\n') + (lines.length > 1 ? '\n' : ''), 'utf8');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lookupSteppedFactor(value: number, anchors: { threshold: number; factor: number }[]): number {
  for (const a of anchors) {
    if (value <= a.threshold) return a.factor;
  }
  return anchors[anchors.length - 1]?.factor ?? 1;
}

function interpolateThermalFactor(score: number, anchors: { score: number; factor: number }[]): number {
  const sorted = [...anchors].sort((a, b) => a.score - b.score);
  if (score <= sorted[0].score) return sorted[0].factor;
  for (let i = 1; i < sorted.length; i++) {
    if (score <= sorted[i].score) {
      const lo = sorted[i - 1];
      const hi = sorted[i];
      const t = (score - lo.score) / (hi.score - lo.score || 1);
      return lo.factor + t * (hi.factor - lo.factor);
    }
  }
  return sorted[sorted.length - 1].factor;
}

function classifyEvidenceSource(
  source: string,
  measuredPad: number | null,
  measuredDisc: number | null,
  confidence: string | null,
  confirmed: boolean,
): { classification: GroundTruthClass; component: Component | 'both' | 'unknown'; exclusion: string } {
  const s = source.toUpperCase();
  if (s === 'TELEMATICS_ESTIMATION') {
    return { classification: 'ESTIMATION_ONLY', component: 'unknown', exclusion: 'telematics_estimation_not_ground_truth' };
  }
  if (s === 'DTC_SIGNAL') {
    return { classification: 'DOCUMENTED_CONDITION_ONLY', component: 'unknown', exclusion: 'dtc_not_thickness_gt' };
  }
  if (s === 'AI_UPLOAD' && !confirmed) {
    return { classification: 'AI_UNCONFIRMED', component: measuredPad != null ? 'pad' : measuredDisc != null ? 'disc' : 'unknown', exclusion: 'ai_not_confirmed' };
  }
  if (measuredPad != null && measuredDisc != null) {
    return { classification: 'TRUE_PAD_MEASUREMENT', component: 'both', exclusion: '' };
  }
  if (measuredPad != null) {
    return { classification: 'TRUE_PAD_MEASUREMENT', component: 'pad', exclusion: '' };
  }
  if (measuredDisc != null) {
    return { classification: 'TRUE_DISC_MEASUREMENT', component: 'disc', exclusion: '' };
  }
  if (['MANUAL_MEASUREMENT', 'WORKSHOP_REPORT', 'INSPECTION_PROTOCOL', 'SERVICE_INVOICE', 'BRAKE_WEAR_SENSOR'].includes(s)) {
    return { classification: 'DOCUMENTED_CONDITION_ONLY', component: 'unknown', exclusion: 'no_mm_value' };
  }
  return { classification: 'UNKNOWN', component: 'unknown', exclusion: 'unclassified' };
}

function padCondition(mm: number): string {
  return classifyMeasuredThickness(mm, BRAKE_HEALTH_CONFIG.pad.criticalMm, BRAKE_HEALTH_CONFIG.pad.warningMm);
}

function discCondition(anchorMm: number, estimatedMm: number): string {
  const crit = anchorMm - BRAKE_HEALTH_CONFIG.disc.maxWearMm;
  const warn = anchorMm - BRAKE_HEALTH_CONFIG.disc.warningWearMm;
  return classifyMeasuredThickness(estimatedMm, crit, warn);
}

function computePadUsage(city: number, highway: number, country: number): number {
  const f = BRAKE_HEALTH_CONFIG.padUsageFactors;
  const total = city + highway + country || 100;
  return round2((city / total) * f.city + (highway / total) * f.highway + (country / total) * f.countryRoad);
}

function computeDiscUsage(city: number, highway: number, country: number): number {
  const f = BRAKE_HEALTH_CONFIG.discUsageFactors;
  const total = city + highway + country || 100;
  return round2((city / total) * f.city + (highway / total) * f.highway + (country / total) * f.countryRoad);
}

function computePadRatePerKm(
  anchorMm: number,
  biasShare: number,
  trip: TripImpactRow,
  fuelType: string,
  kFactor: number,
): number {
  const cfg = BRAKE_HEALTH_CONFIG;
  const usableMm = Math.max(0, anchorMm - cfg.pad.criticalMm);
  if (usableMm <= 0) return 0;
  const baseWearPerKm = usableMm / cfg.pad.baseLifeKm;
  const padUsage = computePadUsage(trip.citySharePct, trip.highwaySharePct, trip.countryRoadSharePct);
  const padStop = lookupSteppedFactor(trip.stopDensity ?? 0, cfg.padStopDensityAnchors);
  const padHard = lookupSteppedFactor(trip.hardBrakePer100Km ?? 0, cfg.padHardBrakeAnchors);
  const padFull = lookupSteppedFactor(trip.fullBrakingPer100Km ?? 0, cfg.padFullBrakingAnchors);
  const reku = cfg.padRekuFactors[fuelType] ?? 1;
  return (
    (baseWearPerKm * biasShare) / cfg.brakeBias.defaultFront *
    padUsage * padStop * padHard * padFull * reku * kFactor
  );
}

function computeDiscRatePerKm(
  anchorMm: number,
  biasShare: number,
  trip: TripImpactRow,
  fuelType: string,
  kFactor: number,
): number {
  const cfg = BRAKE_HEALTH_CONFIG;
  const baseWearPerKm = cfg.disc.maxWearMm / cfg.disc.baseLifeKm;
  const discUsage = computeDiscUsage(trip.citySharePct, trip.highwaySharePct, trip.countryRoadSharePct);
  const discHigh = lookupSteppedFactor((trip.highSpeedBrakeShare ?? 0) * 100, cfg.discHighSpeedBrakeAnchors);
  const discHard = lookupSteppedFactor(trip.hardBrakePer100Km ?? 0, cfg.discHardBrakeAnchors);
  const discFull = lookupSteppedFactor(trip.fullBrakingPer100Km ?? 0, cfg.discFullBrakingAnchors);
  const discThermal = interpolateThermalFactor(trip.thermalBrakeStressScore ?? 0, cfg.discThermalAnchors);
  const reku = cfg.discRekuFactors[fuelType] ?? 1;
  return (
    (baseWearPerKm * biasShare) / cfg.brakeBias.defaultFront *
    discUsage * discHigh * discHard * discFull * discThermal * reku * kFactor
  );
}

interface TripImpactRow {
  tripStartedAt: string;
  distanceKm: number;
  citySharePct: number;
  highwaySharePct: number;
  countryRoadSharePct: number;
  hardBrakePer100Km: number;
  fullBrakingPer100Km: number;
  stopDensity: number;
  highSpeedBrakeShare: number;
  thermalBrakeStressScore: number;
}

function loadTripImpactsBefore(vehicleId: string, beforeIso: string, afterIso?: string): TripImpactRow[] {
  const afterClause = afterIso ? `AND tdi.trip_started_at >= '${afterIso}'::timestamptz` : '';
  const sql = `
    SELECT
      tdi.trip_started_at::text,
      coalesce(tdi.distance_km,0)::text,
      coalesce(tdi.city_share_percent,33)::text,
      coalesce(tdi.highway_share_percent,34)::text,
      coalesce(tdi.country_share_percent,33)::text,
      coalesce(tdi.hard_brake_per_100km,0)::text,
      coalesce(tdi.full_braking_per_100km,0)::text,
      coalesce(tdi.stop_density,0)::text,
      coalesce(tdi.high_speed_brake_share,0)::text,
      coalesce(tdi.thermal_brake_stress_score,0)::text
    FROM trip_driving_impact tdi
    WHERE tdi.vehicle_id = '${vehicleId}'
      AND tdi.trip_started_at < '${beforeIso}'::timestamptz
      ${afterClause}
    ORDER BY tdi.trip_started_at`;
  const raw = runPsql(sql);
  if (!raw) return [];
  return raw.split('\n').map((line) => {
    const p = line.split('\t');
    return {
      tripStartedAt: p[0],
      distanceKm: Number(p[1]) || 0,
      citySharePct: Number(p[2]) || 33,
      highwaySharePct: Number(p[3]) || 34,
      countryRoadSharePct: Number(p[4]) || 33,
      hardBrakePer100Km: Number(p[5]) || 0,
      fullBrakingPer100Km: Number(p[6]) || 0,
      stopDensity: Number(p[7]) || 0,
      highSpeedBrakeShare: Number(p[8]) || 0,
      thermalBrakeStressScore: Number(p[9]) || 0,
    };
  });
}

function odometerNear(vehicleId: string, aroundIso: string): number | null {
  const sql = `
    SELECT odometer_km::text FROM vehicle_latest_states
    WHERE vehicle_id = '${vehicleId}' AND odometer_km IS NOT NULL
    ORDER BY abs(extract(epoch from (updated_at - '${aroundIso}'::timestamptz)))
    LIMIT 1`;
  try {
    const raw = runPsql(sql);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function projectWearAsOf(args: {
  component: Component;
  anchorMm: number;
  anchorOdo: number;
  targetOdo: number;
  anchorTime: string;
  targetTime: string;
  vehicleId: string;
  fuelType: string;
  brakeBiasFront: number;
  kFactor: number;
}): { predictedMm: number; tripCount: number; distanceKm: number; modelingSource: string } {
  const trips = loadTripImpactsBefore(args.vehicleId, args.targetTime, args.anchorTime);
  let worn = 0;
  let distance = 0;
  const biasShare = args.component === 'pad' ? args.brakeBiasFront : 1 - args.brakeBiasFront;
  for (const t of trips) {
    if (!(t.distanceKm > 0)) continue;
    distance += t.distanceKm;
    const rate =
      args.component === 'pad'
        ? computePadRatePerKm(args.anchorMm, biasShare, t, args.fuelType, args.kFactor)
        : computeDiscRatePerKm(args.anchorMm, biasShare, t, args.fuelType, args.kFactor);
    worn += t.distanceKm * rate;
  }

  const odoGap = Math.max(0, args.targetOdo - args.anchorOdo);
  const uncovered = Math.max(0, odoGap - distance);
  let modelingSource = distance > 0 ? 'trip_impacts' : 'none';

  if (uncovered > 0) {
    const avgTrip =
      trips.length > 0
        ? {
            citySharePct: trips.reduce((s, t) => s + t.citySharePct, 0) / trips.length,
            highwaySharePct: trips.reduce((s, t) => s + t.highwaySharePct, 0) / trips.length,
            countryRoadSharePct: trips.reduce((s, t) => s + t.countryRoadSharePct, 0) / trips.length,
            hardBrakePer100Km: trips.reduce((s, t) => s + t.hardBrakePer100Km, 0) / trips.length,
            fullBrakingPer100Km: trips.reduce((s, t) => s + t.fullBrakingPer100Km, 0) / trips.length,
            stopDensity: trips.reduce((s, t) => s + t.stopDensity, 0) / trips.length,
            highSpeedBrakeShare: trips.reduce((s, t) => s + t.highSpeedBrakeShare, 0) / trips.length,
            thermalBrakeStressScore: trips.reduce((s, t) => s + t.thermalBrakeStressScore, 0) / trips.length,
          }
        : {
            citySharePct: 33,
            highwaySharePct: 34,
            countryRoadSharePct: 33,
            hardBrakePer100Km: 0,
            fullBrakingPer100Km: 0,
            stopDensity: 0,
            highSpeedBrakeShare: 0,
            thermalBrakeStressScore: 0,
          };
    const rate =
      args.component === 'pad'
        ? computePadRatePerKm(args.anchorMm, biasShare, avgTrip as TripImpactRow, args.fuelType, args.kFactor)
        : computeDiscRatePerKm(args.anchorMm, biasShare, avgTrip as TripImpactRow, args.fuelType, args.kFactor);
    worn += uncovered * rate;
    distance += uncovered;
    modelingSource = trips.length > 0 ? 'trip_impacts_plus_historical_gap_proxy' : 'historical_gap_proxy_only';
  }

  const predictedMm =
    args.component === 'pad'
      ? clamp(args.anchorMm - worn, 0, args.anchorMm)
      : clamp(args.anchorMm - worn, args.anchorMm - BRAKE_HEALTH_CONFIG.disc.maxWearMm, args.anchorMm);

  return { predictedMm: round2(predictedMm), tripCount: trips.length, distanceKm: round2(distance), modelingSource };
}

function computeConfidenceScore(args: {
  hasPadAnchor: boolean;
  hasDiscAnchor: boolean;
  hasServiceDate: boolean;
  hasImpact: boolean;
  coverageRatio: number;
  modeledTripCount: number;
  modelingSource: string;
  calibrationCount: number;
}): { score: number; label: string } {
  const c = BRAKE_HEALTH_CONFIG.confidence;
  let score = 0;
  if (args.hasPadAnchor) score += c.padAnchors;
  if (args.hasDiscAnchor) score += c.rotorAnchors;
  if (args.hasServiceDate) score += c.serviceEvents;
  if (args.hasImpact) score += c.drivingImpactData + c.brakingMetrics + c.usageData;
  score += c.odometerAvailable;
  if (args.calibrationCount >= BRAKE_HEALTH_CONFIG.calibration.stabilizedThreshold) score += c.calibrationStabilized;
  if (args.coverageRatio >= 0.85) score += 6;
  else if (args.coverageRatio >= 0.6) score += 2;
  else score -= 16;
  if (args.modeledTripCount === 0) score -= 8;
  if (args.modelingSource.includes('gap')) score -= 6;
  if (args.modelingSource === 'historical_gap_proxy_only') score -= 12;
  score = clamp(score, 0, 100);
  let label = 'Low';
  if (score >= BRAKE_HEALTH_CONFIG.confidenceThresholds.high) label = 'High';
  else if (score >= BRAKE_HEALTH_CONFIG.confidenceThresholds.medium) label = 'Medium';
  return { score, label };
}

function loadGroundTruthCandidates(): CandidateRow[] {
  const rows: CandidateRow[] = [];

  const evidenceSql = `
    WITH vehicle_anon AS (SELECT id, row_number() OVER (ORDER BY id) AS anon_rank FROM vehicles)
    SELECT
      va.anon_rank, e.vehicle_id::text, e.id::text, 'brake_evidence',
      coalesce(e.measured_at, e.created_at)::text, e.source::text, e.axle::text,
      e.measured_pad_mm::text, e.measured_disc_mm::text, e.mileage_at_measurement_km::text,
      e.confidence::text
    FROM brake_evidence e
    JOIN vehicle_anon va ON va.id = e.vehicle_id
    ORDER BY e.vehicle_id, e.measured_at`;
  try {
    const raw = runPsql(evidenceSql);
    for (const line of raw ? raw.split('\n') : []) {
      const p = line.split('\t');
      const pad = p[7] ? Number(p[7]) : null;
      const disc = p[8] ? Number(p[8]) : null;
      const cls = classifyEvidenceSource(p[5], pad, disc, p[10], false);
      rows.push({
        anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
        vehicleId: p[1],
        recordId: p[2],
        recordType: p[3],
        timestamp: p[4],
        source: p[5],
        axle: (p[6]?.toLowerCase() as Axle) ?? 'unknown',
        component: cls.component,
        valueMm: pad ?? disc,
        odometerKm: p[9] ? Number(p[9]) : null,
        confidence: p[10],
        classification: cls.classification,
        exclusionFromBacktest: cls.exclusion || (cls.classification.startsWith('TRUE_') ? '' : 'not_ground_truth'),
        notes: pad != null ? `pad=${pad}` : disc != null ? `disc=${disc}` : '',
      });
    }
  } catch {
    /* table empty or unavailable */
  }

  const specSql = `
    WITH vehicle_anon AS (SELECT id, row_number() OVER (ORDER BY id) AS anon_rank FROM vehicles)
    SELECT
      va.anon_rank, r.vehicle_id::text, r.id::text, 'reference_spec',
      r.created_at::text, coalesce(r.source_type,'MANUAL'), 'unknown',
      r.front_pad_thickness::text, r.rear_pad_thickness::text,
      r.front_rotor_width::text, r.rear_rotor_width::text
    FROM vehicle_brake_reference_specs r
    JOIN vehicle_anon va ON va.id = r.vehicle_id`;
  const specRaw = runPsql(specSql);
  for (const line of specRaw ? specRaw.split('\n') : []) {
    const p = line.split('\t');
    const frontPad = p[7] ? Number(p[7]) : null;
    const rearPad = p[8] ? Number(p[8]) : null;
    const frontDisc = p[9] ? Number(p[9]) : null;
    const rearDisc = p[10] ? Number(p[10]) : null;
    for (const [axle, pad, disc] of [
      ['front', frontPad, frontDisc],
      ['rear', rearPad, rearDisc],
    ] as const) {
      if (pad != null) {
        rows.push({
          anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
          vehicleId: p[1],
          recordId: `spec_${String(p[0]).padStart(3, '0')}_${axle}_pad`,
          recordType: p[3],
          timestamp: p[4],
          source: p[5],
          axle,
          component: 'pad',
          valueMm: pad,
          odometerKm: null,
          confidence: null,
          classification: 'SPEC_ONLY',
          exclusionFromBacktest: 'spec_fallback_not_ground_truth',
          notes: 'registration/reference spec — not a confirmed measurement',
        });
      }
      if (disc != null) {
        rows.push({
          anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
          vehicleId: p[1],
          recordId: `spec_${String(p[0]).padStart(3, '0')}_${axle}_disc`,
          recordType: p[3],
          timestamp: p[4],
          source: p[5],
          axle,
          component: 'disc',
          valueMm: disc,
          odometerKm: null,
          confidence: null,
          classification: 'SPEC_ONLY',
          exclusionFromBacktest: 'spec_fallback_not_ground_truth; rotor_width_used_as_disc_thickness_risk',
          notes: 'reference rotor width — semantic mismatch vs disc thickness',
        });
      }
    }
  }

  const serviceSql = `
    WITH vehicle_anon AS (SELECT id, row_number() OVER (ORDER BY id) AS anon_rank FROM vehicles)
    SELECT
      va.anon_rank, s.vehicle_id::text, s.id::text, 'service_event',
      s.event_date::text, coalesce(s.brake_service_source::text,'MANUAL'),
      s.odometer_km::text, s.brake_measured_snapshot::text, s.brake_service_kind::text
    FROM vehicle_service_events s
    JOIN vehicle_anon va ON va.id = s.vehicle_id
    WHERE s.event_type = 'BRAKE_SERVICE'`;
  try {
    const raw = runPsql(serviceSql);
    for (const line of raw ? raw.split('\n') : []) {
      const p = line.split('\t');
      let snap: Record<string, unknown> = {};
      try {
        snap = p[7] ? JSON.parse(p[7]) : {};
      } catch {
        snap = {};
      }
      const padF = typeof snap.frontPadMm === 'number' ? snap.frontPadMm : null;
      const padR = typeof snap.rearPadMm === 'number' ? snap.rearPadMm : null;
      const discF = typeof snap.frontDiscMm === 'number' ? snap.frontDiscMm : null;
      const discR = typeof snap.rearDiscMm === 'number' ? snap.rearDiscMm : null;
      const cls = classifyEvidenceSource(p[5], padF ?? padR, discF ?? discR, 'HIGH', true);
      rows.push({
        anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
        vehicleId: p[1],
        recordId: p[2],
        recordType: p[3],
        timestamp: p[4],
        source: p[5],
        axle: 'unknown',
        component: cls.component,
        valueMm: padF ?? padR ?? discF ?? discR,
        odometerKm: p[6] ? Number(p[6]) : null,
        confidence: 'HIGH',
        classification: p[8] === 'FULL_BRAKE_SERVICE' && (padF || discF) ? cls.classification : 'DOCUMENTED_CONDITION_ONLY',
        exclusionFromBacktest: cls.exclusion || 'service_without_mm_or_scope_unclear',
        notes: `kind=${p[8] ?? 'unknown'}`,
      });
    }
  } catch {
    /* no services */
  }

  return rows;
}

function loadVehicleMeta(): Map<string, { anonId: string; fuelType: string; brakeBiasFront: number }> {
  const sql = `
    WITH vehicle_anon AS (SELECT id, row_number() OVER (ORDER BY id) AS anon_rank FROM vehicles)
    SELECT va.anon_rank, v.id::text, v.fuel_type::text, coalesce(v.brake_force_front_percent,72)::text
    FROM vehicles v JOIN vehicle_anon va ON va.id = v.id`;
  const map = new Map<string, { anonId: string; fuelType: string; brakeBiasFront: number }>();
  for (const line of runPsql(sql).split('\n')) {
    const p = line.split('\t');
    map.set(p[1], {
      anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
      fuelType: p[2] || 'GASOLINE',
      brakeBiasFront: (Number(p[3]) || 72) / 100,
    });
  }
  return map;
}

function metrics(values: number[]) {
  const n = values.length;
  if (n === 0) return null;
  const abs = values.map(Math.abs);
  const mae = abs.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(values.reduce((s, v) => s + v * v, 0) / n);
  const bias = values.reduce((a, b) => a + b, 0) / n;
  const sorted = [...abs].sort((a, b) => a - b);
  const median = sorted[Math.floor((n - 1) / 2)];
  const p90 = sorted[Math.min(n - 1, Math.ceil(n * 0.9) - 1)];
  return {
    n,
    mae: round3(mae),
    rmse: round3(rmse),
    bias: round3(bias),
    medianAbs: round3(median),
    p90Abs: round3(p90),
    within05Pct: round2((abs.filter((v) => v <= 0.5).length / n) * 100),
    within10Pct: round2((abs.filter((v) => v <= 1.0).length / n) * 100),
    overPct: round2((values.filter((v) => v > 0).length / n) * 100),
    underPct: round2((values.filter((v) => v < 0).length / n) * 100),
  };
}

function buildConfidenceMatrix(): ConfidenceMatrixRow[] {
  const c = BRAKE_HEALTH_CONFIG.confidence;
  const specOnlyScore =
    c.padAnchors + c.rotorAnchors + c.serviceEvents + c.drivingImpactData +
    c.brakingMetrics + c.usageData + c.odometerAvailable + 6;
  return [
    {
      scenario: 'spec_fallback_anchor_with_full_DI_and_high_coverage',
      dataBasis: 'ESTIMATED',
      expectedConfidence: specOnlyScore >= 80 ? 'High' : 'Medium',
      canReachHigh: specOnlyScore >= 80,
      codeEvidence: `computeConfidence adds padAnchors(${c.padAnchors})+rotorAnchors(${c.rotorAnchors}) without checking anchorValidationStatus; measurementExists(${c.measurementExists}) unused`,
      fleetValidated: false,
      finding: 'P1-BH-50: Spec-only anchor can score HIGH without any true measurement',
    },
    {
      scenario: 'rolling_gap_only_modeling',
      dataBasis: 'ESTIMATED',
      expectedConfidence: 'Low',
      canReachHigh: false,
      codeEvidence: 'rolling_gap_only −12, modeledTripCount=0 −8, low coverage −16',
      fleetValidated: false,
      finding: 'Gap-only path penalized in code but not blocked',
    },
    {
      scenario: 'safety_dtc_evidence',
      dataBasis: 'DOCUMENTED',
      expectedConfidence: 'N/A wear accuracy',
      canReachHigh: false,
      codeEvidence: 'DTC drives canonical CRITICAL via buildCanonicalReadModel, separate from wear confidence',
      fleetValidated: false,
      finding: 'Safety evidence can elevate condition without improving wear-model confidence',
    },
    {
      scenario: 'ai_upload_unconfirmed',
      dataBasis: 'DOCUMENTED',
      expectedConfidence: 'Should be LOW',
      canReachHigh: false,
      codeEvidence: 'AI evidence only after apply confirmation; fleet has 0 brake AI rows',
      fleetValidated: true,
      finding: 'No unconfirmed AI brake ground truth in production',
    },
    {
      scenario: 'calibration_stabilized_k_factor',
      dataBasis: 'MEASURED',
      expectedConfidence: 'Higher with calibrationCount>=4',
      canReachHigh: true,
      codeEvidence: `calibrationStabilized +${c.calibrationStabilized} when count>=${BRAKE_HEALTH_CONFIG.calibration.stabilizedThreshold}`,
      fleetValidated: false,
      finding: 'P1-BH-51: calibrateFromMeasurement() not implemented — fleet calibrationCount always 0',
    },
    {
      scenario: 'estimated_condition_cap',
      dataBasis: 'ESTIMATED',
      expectedConfidence: 'Medium max for display',
      canReachHigh: false,
      codeEvidence: 'classifyEstimatedCondition caps at WARNING; CRITICAL requires measured safety signal',
      fleetValidated: true,
      finding: 'Code-enforced honesty rule confirmed in unit tests',
    },
  ];
}

function determineVerdict(reproducibleCount: number, gtMeasurementCount: number): string {
  if (gtMeasurementCount === 0) return 'NOT_ENOUGH_DATA';
  if (reproducibleCount === 0) return 'NOT_VALIDATED';
  if (reproducibleCount < 10) return 'PARTIALLY_VALIDATED';
  return 'VALIDATED';
}

async function main(): Promise<void> {
  if (process.env.BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD !== '1') {
    throw new Error('Set BRAKE_HEALTH_DIMO_AUDIT_ALLOW_PROD=1 for supervised read-only backtest.');
  }

  const outputDir = path.resolve(parseArg('--output-dir') ?? path.join(scriptDir, '..', '..', 'docs', 'audits', 'data'));
  fs.mkdirSync(outputDir, { recursive: true });

  const candidates = loadGroundTruthCandidates();
  const vehicleMeta = loadVehicleMeta();

  const gtClassificationRows = candidates.map((c) => ({
    anonymizedVehicleId: c.anonId,
    recordType: c.recordType,
    recordId: c.recordId,
    timestamp: c.timestamp,
    source: c.source,
    axle: c.axle,
    component: c.component,
    valueMm: c.valueMm ?? '',
    odometerKm: c.odometerKm ?? '',
    confidence: c.confidence ?? '',
    classification: c.classification,
    eligibleForBacktest: c.classification.startsWith('TRUE_') || c.classification === 'CONFIRMED_REPLACEMENT',
    exclusionReason: c.exclusionFromBacktest,
    notes: c.notes,
  }));

  const trueMeasurements = candidates.filter(
    (c) =>
      (c.classification === 'TRUE_PAD_MEASUREMENT' || c.classification === 'TRUE_DISC_MEASUREMENT') &&
      c.valueMm != null &&
      c.axle !== 'unknown',
  );

  const backtestRows: BacktestRow[] = [];

  const byVehicleComponent = new Map<string, CandidateRow[]>();
  for (const m of trueMeasurements) {
    const key = `${m.vehicleId}:${m.component}:${m.axle}`;
    if (!byVehicleComponent.has(key)) byVehicleComponent.set(key, []);
    byVehicleComponent.get(key)!.push(m);
  }
  for (const list of byVehicleComponent.values()) {
    list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  for (const target of trueMeasurements) {
    const key = `${target.vehicleId}:${target.component}:${target.axle}`;
    const priors = (byVehicleComponent.get(key) ?? []).filter(
      (p) => new Date(p.timestamp).getTime() < new Date(target.timestamp).getTime(),
    );
    const prior = priors.length > 0 ? priors[priors.length - 1] : null;
    const meta = vehicleMeta.get(target.vehicleId);
    const component = target.component as Component;
    const axle = target.axle as Axle;

    let reproducible = false;
    let exclusionReason = 'no_prior_anchor';
    let predictedMm: number | null = null;
    let modelingSource = 'none';
    let tripCount = 0;
    let distanceKm = 0;
    let coverage = 0;
    let kFactor = 1;
    let confidence = 'UNKNOWN';

    if (!prior || prior.valueMm == null) {
      exclusionReason = prior ? 'prior_missing_mm' : 'NOT_REPRODUCIBLE_ANCHOR';
    } else {
      const anchorOdo = prior.odometerKm ?? odometerNear(target.vehicleId, prior.timestamp);
      const targetOdo = target.odometerKm ?? odometerNear(target.vehicleId, target.timestamp);
      if (anchorOdo == null || targetOdo == null) {
        exclusionReason = 'NOT_REPRODUCIBLE_NO_HISTORY';
      } else if (targetOdo < anchorOdo) {
        exclusionReason = 'NOT_REPRODUCIBLE_ANCHOR';
      } else {
        const proj = projectWearAsOf({
          component,
          anchorMm: prior.valueMm,
          anchorOdo,
          targetOdo,
          anchorTime: prior.timestamp,
          targetTime: target.timestamp,
          vehicleId: target.vehicleId,
          fuelType: meta?.fuelType ?? 'GASOLINE',
          brakeBiasFront: meta?.brakeBiasFront ?? BRAKE_HEALTH_CONFIG.brakeBias.defaultFront,
          kFactor,
        });
        predictedMm = proj.predictedMm;
        modelingSource = proj.modelingSource;
        tripCount = proj.tripCount;
        distanceKm = proj.distanceKm;
        const odoGap = targetOdo - anchorOdo;
        coverage = odoGap > 0 ? round2(Math.min(1, distanceKm / odoGap)) : 0;
        const conf = computeConfidenceScore({
          hasPadAnchor: component === 'pad',
          hasDiscAnchor: component === 'disc',
          hasServiceDate: true,
          hasImpact: tripCount > 0,
          coverageRatio: coverage,
          modeledTripCount: tripCount,
          modelingSource,
          calibrationCount: 0,
        });
        confidence = conf.label;
        reproducible = true;
        exclusionReason = '';
      }
    }

    const measuredMm = target.valueMm!;
    const signedError = predictedMm != null ? round3(measuredMm - predictedMm) : '';
    const absError = predictedMm != null ? round3(Math.abs(measuredMm - predictedMm)) : '';
    const predCond =
      predictedMm != null
        ? component === 'pad'
          ? padCondition(predictedMm)
          : discCondition(prior?.valueMm ?? measuredMm, predictedMm)
        : '';
    const actualCond =
      component === 'pad' ? padCondition(measuredMm) : discCondition(prior?.valueMm ?? measuredMm, measuredMm);

    backtestRows.push({
      anonymizedVehicleId: target.anonId,
      component,
      axle,
      anchorTimestamp: prior?.timestamp ?? '',
      anchorSource: prior?.source ?? '',
      anchorMm: prior?.valueMm ?? '',
      targetMeasurementTimestamp: target.timestamp,
      targetSource: target.source,
      predictedMm: predictedMm ?? '',
      measuredMm,
      signedErrorMm: signedError,
      absoluteErrorMm: absError,
      predictedCondition: predCond,
      actualCondition: actualCond,
      confidence,
      coverage,
      modelingSource,
      kFactor,
      modelVersion: MODEL_VERSION,
      reproducible,
      exclusionReason,
      powertrain: meta?.fuelType ?? '',
      brakeBiasSource: meta?.brakeBiasFront != null ? 'vehicle_brake_force_front_percent' : 'default_0.72',
      calibrationCount: 0,
      tripCountBeforeTarget: tripCount,
      distanceKmModeled: distanceKm,
    });
  }

  const reproducible = backtestRows.filter((r) => r.reproducible && r.predictedMm !== '');
  const padFrontErrors = reproducible.filter((r) => r.component === 'pad' && r.axle === 'front').map((r) => Number(r.signedErrorMm));
  const padRearErrors = reproducible.filter((r) => r.component === 'pad' && r.axle === 'rear').map((r) => Number(r.signedErrorMm));
  const discFrontErrors = reproducible.filter((r) => r.component === 'disc' && r.axle === 'front').map((r) => Number(r.signedErrorMm));
  const discRearErrors = reproducible.filter((r) => r.component === 'disc' && r.axle === 'rear').map((r) => Number(r.signedErrorMm));
  const allErrors = reproducible.map((r) => Number(r.signedErrorMm));

  const mAll = metrics(allErrors);
  const mPadF = metrics(padFrontErrors);
  const mPadR = metrics(padRearErrors);
  const mDiscF = metrics(discFrontErrors);
  const mDiscR = metrics(discRearErrors);

  const gtMeasurementCount = candidates.filter((c) => c.classification.startsWith('TRUE_')).length;
  const confirmedReplacements = candidates.filter((c) => c.classification === 'CONFIRMED_REPLACEMENT').length;
  const specOnlyCount = candidates.filter((c) => c.classification === 'SPEC_ONLY').length;
  const verdict = determineVerdict(reproducible.length, gtMeasurementCount);

  const summaryRows = [
    {
      metric: 'verdict',
      segment: 'fleet',
      n: reproducible.length,
      value: verdict,
      notes: `ground_truth_measurements=${gtMeasurementCount}; spec_only=${specOnlyCount}; confirmed_replacements=${confirmedReplacements}`,
    },
    {
      metric: 'MAE_mm',
      segment: 'all_reproducible',
      n: mAll?.n ?? 0,
      value: mAll?.mae ?? '',
      notes: 'signed error = measured - predicted',
    },
    {
      metric: 'RMSE_mm',
      segment: 'all_reproducible',
      n: mAll?.n ?? 0,
      value: mAll?.rmse ?? '',
      notes: '',
    },
    {
      metric: 'bias_mm',
      segment: 'all_reproducible',
      n: mAll?.n ?? 0,
      value: mAll?.bias ?? '',
      notes: 'positive = underprediction (measured > predicted)',
    },
    {
      metric: 'MAE_pad_front',
      segment: 'pad_front',
      n: mPadF?.n ?? 0,
      value: mPadF?.mae ?? '',
      notes: '',
    },
    {
      metric: 'MAE_pad_rear',
      segment: 'pad_rear',
      n: mPadR?.n ?? 0,
      value: mPadR?.mae ?? '',
      notes: '',
    },
    {
      metric: 'MAE_disc_front',
      segment: 'disc_front',
      n: mDiscF?.n ?? 0,
      value: mDiscF?.mae ?? '',
      notes: '',
    },
    {
      metric: 'MAE_disc_rear',
      segment: 'disc_rear',
      n: mDiscR?.n ?? 0,
      value: mDiscR?.mae ?? '',
      notes: '',
    },
    {
      metric: 'within_0.5mm_pct',
      segment: 'all_reproducible',
      n: mAll?.n ?? 0,
      value: mAll?.within05Pct ?? '',
      notes: '',
    },
    {
      metric: 'within_1.0mm_pct',
      segment: 'all_reproducible',
      n: mAll?.n ?? 0,
      value: mAll?.within10Pct ?? '',
      notes: '',
    },
    {
      metric: 'k_factor_calibrations_fleet',
      segment: 'fleet',
      n: 0,
      value: 0,
      notes: 'calibrateFromMeasurement not implemented; calibrationCount always 0',
    },
    {
      metric: 'model_version',
      segment: 'config',
      n: 1,
      value: MODEL_VERSION,
      notes: 'not persisted in brake_health_current (0 rows)',
    },
  ];

  const confidenceRows = buildConfidenceMatrix().map((r) => ({
    scenario: r.scenario,
    dataBasis: r.dataBasis,
    expectedConfidence: r.expectedConfidence,
    canReachHigh: r.canReachHigh,
    codeEvidence: r.codeEvidence,
    fleetValidated: r.fleetValidated,
    finding: r.finding,
  }));

  const gtPath = path.join(outputDir, 'brake-health-ground-truth-classification-2026-07.csv');
  const btPath = path.join(outputDir, 'brake-health-backtest-summary-2026-07.csv');
  const confPath = path.join(outputDir, 'brake-health-confidence-calibration-2026-07.csv');

  writeCsv(gtPath, gtClassificationRows);
  writeCsv(btPath, [
    ...backtestRows.map((r) => ({ ...r })),
    ...summaryRows.map((s) => ({
    anonymizedVehicleId: 'FLEET_SUMMARY',
    component: s.segment,
    axle: s.metric,
    anchorTimestamp: '',
    anchorSource: '',
    anchorMm: '',
    targetMeasurementTimestamp: '',
    targetSource: '',
    predictedMm: '',
    measuredMm: '',
    signedErrorMm: '',
    absoluteErrorMm: '',
    predictedCondition: '',
    actualCondition: '',
    confidence: '',
    coverage: '',
    modelingSource: '',
    kFactor: '',
    modelVersion: MODEL_VERSION,
    reproducible: false,
    exclusionReason: s.notes,
    powertrain: '',
    brakeBiasSource: '',
    calibrationCount: s.n,
    tripCountBeforeTarget: '',
    distanceKmModeled: s.value,
    })),
  ]);
  writeCsv(confPath, confidenceRows);

  const summary = {
    auditId: AUDIT_ID,
    completedAt: new Date().toISOString(),
    mode: 'read-only',
    modelVersion: MODEL_VERSION,
    verdict,
    groundTruthCandidates: candidates.length,
    trueMeasurements: gtMeasurementCount,
    confirmedReplacements,
    specOnlyRows: specOnlyCount,
    reproducibleBacktests: reproducible.length,
    metrics: { all: mAll, padFront: mPadF, padRear: mPadR, discFront: mDiscF, discRear: mDiscR },
    kFactorCalibrationsFleet: 0,
    outputFiles: [gtPath, btPath, confPath],
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
