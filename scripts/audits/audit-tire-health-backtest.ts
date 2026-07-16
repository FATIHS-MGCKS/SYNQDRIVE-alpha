#!/usr/bin/env ts-node
/**
 * Tire Health Historical Backtest — read-only, as-of semantics.
 *
 * Validates wear-model predictions against verified manual/documented tread measurements.
 * NO recalculate(), NO calibration writes, NO production mutations.
 *
 * Usage (supervised production):
 *   cd backend && TIRE_HEALTH_AUDIT_ALLOW_PROD=1 \
 *     npx ts-node -r tsconfig-paths/register ../scripts/audits/audit-tire-health-backtest.ts \
 *     --output-dir=../docs/audits/data
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const scriptDir = path.resolve(path.dirname(process.argv[1] ?? '.'));
const backendRoot = path.resolve(scriptDir, '..', '..', 'backend');
const requireFromBackend = createRequire(path.join(backendRoot, 'package.json'));

const {
  TIRE_HEALTH_CONFIG,
  parseAiTireSpec,
  resolveArchetype,
  resolveReferenceNewTread,
  resolveReplacementThreshold,
  resolveExpectedLifeKm,
} = requireFromBackend('./dist/src/modules/vehicle-intelligence/tires/tire-health.config.js');

const AUDIT_ID = 'tire-health-backtest-2026-07';
const MODEL_VERSION = 'TIRE_HEALTH_V2'; // no persisted modelVersion in DB/snapshots

function classifyConfidenceLevel(args: {
  hasMeasurement: boolean;
  measurementAgeDays: number | null;
  kmSinceMeasurement: number | null;
  hasWearBaseline: boolean;
}): string {
  const { hasMeasurement, measurementAgeDays, kmSinceMeasurement, hasWearBaseline } = args;
  if (!hasMeasurement) return hasWearBaseline ? 'LOW' : 'UNKNOWN';
  const c = TIRE_HEALTH_CONFIG.confidenceLevels;
  const ageOk = measurementAgeDays == null || measurementAgeDays <= c.highMaxMeasurementAgeDays;
  const kmOk = kmSinceMeasurement == null || kmSinceMeasurement <= c.highMaxKmSinceMeasurement;
  if (ageOk && kmOk) return 'HIGH';
  const ageMed = measurementAgeDays == null || measurementAgeDays <= c.mediumMaxMeasurementAgeDays;
  const kmMed = kmSinceMeasurement == null || kmSinceMeasurement <= c.mediumMaxKmSinceMeasurement;
  if (ageMed && kmMed) return 'MEDIUM';
  return 'LOW';
}

function confidenceLevelToLabel(level: string): string {
  switch (level) {
    case 'HIGH': return 'High';
    case 'MEDIUM': return 'Medium';
    case 'LOW': return 'Low';
    default: return 'Low';
  }
}

const GROUND_TRUTH_SOURCES = new Set([
  'manual',
  'workshop',
  'manual_registration',
  'ai_confirmed',
  'calibration',
]);

const WHEELS = ['FL', 'FR', 'RL', 'RR'] as const;
type Wheel = (typeof WHEELS)[number];

interface MeasurementRow {
  anonId: string;
  vehicleId: string;
  measurementId: string;
  measuredAt: string;
  source: string;
  isCalibrationPoint: boolean;
  fl: number | null;
  fr: number | null;
  rl: number | null;
  rr: number | null;
  odometerAtMeasurement: number | null;
  setupId: string;
  installedAt: string;
  installedOdometerKm: number | null;
  initialTreadDepthMm: number | null;
  initialTreadFrontMm: number | null;
  initialTreadRearMm: number | null;
  initialTreadSource: string | null;
  totalKmOnSet: number | null;
  kFactorFront: number;
  kFactorRear: number;
  kFactorCalibrationCount: number;
  tireSeason: string;
  fuelType: string;
  driveType: string | null;
  curbWeightKg: number | null;
  frontWeightDistributionPct: number | null;
  aiTireSpecJson: string | null;
  expectedLifeKm: number | null;
  isStaggered: boolean;
  frontTireWidthMm: number | null;
  rearTireWidthMm: number | null;
}

interface BacktestRow {
  anonymizedVehicleId: string;
  tireSetupClass: string;
  measurementTimestamp: string;
  wheelPosition: Wheel;
  groundTruthSource: string;
  predictedTreadMm: string | number;
  measuredTreadMm: number;
  signedErrorMm: string | number;
  absoluteErrorMm: string | number;
  confidence: string;
  specSource: string;
  baselineSource: string;
  pressureCoverage: string;
  distanceSinceBaselineKm: string | number;
  modelVersion: string;
  reproducible: boolean;
  exclusionReason: string;
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function wheelValue(m: MeasurementRow, w: Wheel): number | null {
  switch (w) {
    case 'FL': return m.fl;
    case 'FR': return m.fr;
    case 'RL': return m.rl;
    case 'RR': return m.rr;
  }
}

function classifySetup(row: MeasurementRow): string {
  if (row.initialTreadSource === 'initial_manual_plus_wear' && row.initialTreadDepthMm === 8) return 'SETUP_INCOMPLETE_8MM';
  if (!row.aiTireSpecJson) return 'SETUP_INCOMPLETE_NO_SPEC';
  if (row.initialTreadSource === 'calibration_projection') return 'CALIBRATION_PROJECTION';
  return 'MEASURED_BASELINE';
}

function normalizeGroundTruthSource(source: string): string {
  const s = source.toLowerCase();
  if (s === 'manual_registration') return 'documented_registration';
  if (s === 'manual' || s === 'workshop' || s === 'ai_confirmed' || s === 'calibration') return s;
  return s;
}

function isGroundTruthMeasurement(m: MeasurementRow): boolean {
  if (!GROUND_TRUTH_SOURCES.has(m.source.toLowerCase())) return false;
  const vals = [m.fl, m.fr, m.rl, m.rr].filter((v): v is number => v != null);
  if (vals.length === 0) return false;
  // Reject obvious 8mm default-only rows with no per-wheel variation and no spec
  if (!m.aiTireSpecJson && vals.every((v) => Math.abs(v - 8) < 0.01)) return false;
  return true;
}

function snapshotOdometer(vehicleId: string, aroundIso: string): number | null {
  const sql = `
    SELECT s.odometer_km::text
    FROM tire_health_snapshots s
    WHERE s.vehicle_id = '${vehicleId}'
      AND s.odometer_km IS NOT NULL
      AND s.snapshot_date BETWEEN ('${aroundIso}'::timestamptz - interval '24 hours')
                              AND ('${aroundIso}'::timestamptz + interval '48 hours')
    ORDER BY abs(extract(epoch from (s.snapshot_date - '${aroundIso}'::timestamptz)))
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

function tripsBefore(vehicleId: string, beforeIso: string): { cityPct: number; highwayPct: number; ruralPct: number; count: number; distanceKm: number } {
  const sql = `
    SELECT
      count(*)::text,
      coalesce(sum(distance_km),0)::text,
      coalesce(avg(city_share_percent),33)::text,
      coalesce(avg(highway_share_percent),34)::text,
      coalesce(avg(country_share_percent),33)::text
    FROM vehicle_trips t
    WHERE t.vehicle_id = '${vehicleId}' AND t.end_time <= '${beforeIso}'::timestamptz`;
  const raw = runPsql(sql);
  if (!raw) return { cityPct: 33, highwayPct: 34, ruralPct: 33, count: 0, distanceKm: 0 };
  const [count, dist, city, highway, rural] = raw.split('\t');
  return {
    count: Number(count) || 0,
    distanceKm: Number(dist) || 0,
    cityPct: Number(city) || 33,
    highwayPct: Number(highway) || 34,
    ruralPct: Number(rural) || 33,
  };
}

function pressureCoverageAt(vehicleId: string, beforeIso: string): 'yes' | 'no' {
  const sql = `
    SELECT count(*)::text FROM vehicle_latest_states ls
    WHERE ls.vehicle_id = '${vehicleId}'
      AND ls.tire_pressure_fl IS NOT NULL
      AND ls.updated_at <= '${beforeIso}'::timestamptz`;
  try {
    return Number(runPsql(sql)) > 0 ? 'yes' : 'no';
  } catch {
    return 'no';
  }
}

function computeAxleFactor(axle: 'front' | 'rear', driveType: string | null, frontWeightDistPct: number | null): number {
  const cfg = TIRE_HEALTH_CONFIG;
  const dtKey = driveType?.toUpperCase() ?? 'default';
  const bias = cfg.drivetrainBias[dtKey] ?? cfg.drivetrainBias['default'];
  const drivetrainBias = axle === 'front' ? bias.front : bias.rear;
  const steeringBias = axle === 'front' ? cfg.steeringAxleBias.front : cfg.steeringAxleBias.rear;
  let dampedLoadFactor = 1.0;
  if (frontWeightDistPct != null && frontWeightDistPct > 0 && frontWeightDistPct < 100) {
    const frontRatio = frontWeightDistPct / 100;
    const rearRatio = 1 - frontRatio;
    const loadBias = axle === 'front' ? frontRatio / 0.5 : rearRatio / 0.5;
    dampedLoadFactor = 1 + (loadBias - 1) * cfg.loadBiasDampingCoeff;
  }
  const raw = dampedLoadFactor * drivetrainBias * steeringBias;
  return round3(clamp(raw, cfg.factorCaps.axleMin, cfg.factorCaps.axleMax));
}

function computeUsageFactor(cityPct: number, highwayPct: number, ruralPct: number): number {
  const cfg = TIRE_HEALTH_CONFIG;
  const city = cityPct / 100;
  const highway = highwayPct / 100;
  const country = ruralPct / 100;
  const total = city + highway + country || 1;
  const raw =
    (city / total) * cfg.usageFactors.city +
    (highway / total) * cfg.usageFactors.highway +
    (country / total) * cfg.usageFactors.countryRoad;
  return round3(clamp(raw, cfg.factorCaps.usageMin, cfg.factorCaps.usageMax));
}

function projectTreadAsOf(args: {
  anchor: { fl: number; fr: number; rl: number; rr: number };
  kmSince: number;
  setup: MeasurementRow;
  vehicle: { fuelType: string; driveType: string | null; curbWeightKg: number | null; frontWeightDistributionPct: number | null };
  usage: { cityPct: number; highwayPct: number; ruralPct: number };
}): { fl: number; fr: number; rl: number; rr: number } {
  const { anchor, kmSince, setup, vehicle, usage } = args;
  if (kmSince <= 0) return anchor;

  const spec = parseAiTireSpec(setup.aiTireSpecJson ? JSON.parse(setup.aiTireSpecJson) : null);
  const season = setup.tireSeason ?? 'ALL_SEASON';
  const archetype = resolveArchetype(spec, season);
  const refNew = resolveReferenceNewTread(
    setup.initialTreadFrontMm, setup.initialTreadRearMm, setup.initialTreadDepthMm,
    spec, archetype, season,
  );
  const repl = resolveReplacementThreshold(spec, archetype, season);
  const resolvedLifeKm = resolveExpectedLifeKm(spec, archetype, season, setup.expectedLifeKm);

  const axleFactorFront = computeAxleFactor('front', vehicle.driveType, vehicle.frontWeightDistributionPct);
  const axleFactorRear = computeAxleFactor('rear', vehicle.driveType, vehicle.frontWeightDistributionPct);
  const usageFactor = computeUsageFactor(usage.cityPct, usage.highwayPct, usage.ruralPct);
  const behaviorFactor = 1.0; // historical driving-impact snapshots not persisted
  const temperatureFactor = 1.0;
  const pressureFactor = 1.0;
  const loadFactor = 1.0;
  const seasonMismatchFactor = 1.0;
  const interactionPenalty = 1.0;

  const regenFront = setup.kFactorFront >= 0 ? 1.0 : 1.0;
  const regenRear = 1.0;

  const usableFront = refNew.front - repl.mm;
  const usableRear = refNew.rear - repl.mm;
  const baseWearMmPerKmFront = usableFront > 0 ? usableFront / resolvedLifeKm : 0;
  const baseWearMmPerKmRear = usableRear > 0 ? usableRear / resolvedLifeKm : 0;

  const effectiveWearFront =
    baseWearMmPerKmFront *
    axleFactorFront * usageFactor * behaviorFactor * temperatureFactor *
    pressureFactor * loadFactor * seasonMismatchFactor *
    setup.kFactorFront * regenFront * interactionPenalty;

  const effectiveWearRear =
    baseWearMmPerKmRear *
    axleFactorRear * usageFactor * behaviorFactor * temperatureFactor *
    pressureFactor * loadFactor * seasonMismatchFactor *
    setup.kFactorRear * regenRear * interactionPenalty;

  const rateFront = effectiveWearFront > 0 ? 1 / effectiveWearFront : 999999;
  const rateRear = effectiveWearRear > 0 ? 1 / effectiveWearRear : 999999;

  const frontWearMm = kmSince / rateFront;
  const rearWearMm = kmSince / rateRear;

  return {
    fl: round3(Math.max(0, anchor.fl - frontWearMm)),
    fr: round3(Math.max(0, anchor.fr - frontWearMm)),
    rl: round3(Math.max(0, anchor.rl - rearWearMm)),
    rr: round3(Math.max(0, anchor.rr - rearWearMm)),
  };
}

function loadMeasurements(): MeasurementRow[] {
  const sql = `
    WITH vehicle_anon AS (
      SELECT id, row_number() OVER (ORDER BY id) AS anon_rank
      FROM vehicles
    )
    SELECT
      va.anon_rank,
      v.id::text,
      m.id::text,
      m.measured_at::text,
      m.source,
      m.is_calibration_point,
      m.front_left_mm, m.front_right_mm, m.rear_left_mm, m.rear_right_mm,
      m.odometer_at_measurement,
      s.id::text,
      s.installed_at::text,
      s.installed_odometer_km,
      s.initial_tread_depth_mm, s.initial_tread_front_mm, s.initial_tread_rear_mm,
      s.initial_tread_source,
      s.total_km_on_set,
      s.k_factor_front, s.k_factor_rear, s.k_factor_calibration_count,
      s.tire_season::text,
      v.fuel_type::text,
      v.drive_type::text,
      v.curb_weight_kg,
      v.front_weight_distribution_pct,
      s.ai_tire_spec::text,
      s.expected_life_km,
      s.is_staggered,
      s.front_tire_width_mm,
      s.rear_tire_width_mm
    FROM vehicle_tire_tread_measurements m
    JOIN vehicle_tire_setups s ON s.id = m.tire_setup_id
    JOIN vehicles v ON v.id = m.vehicle_id
    JOIN vehicle_anon va ON va.id = v.id
    WHERE s.status = 'ACTIVE' AND s.removed_at IS NULL
    ORDER BY v.id, m.measured_at`;

  const raw = runPsql(sql);
  if (!raw) return [];

  return raw.split('\n').map((line) => {
    const p = line.split('\t');
    return {
      anonId: `VEHICLE_${String(p[0]).padStart(3, '0')}`,
      vehicleId: p[1],
      measurementId: p[2],
      measuredAt: p[3],
      source: p[4],
      isCalibrationPoint: p[5] === 't',
      fl: p[6] ? Number(p[6]) : null,
      fr: p[7] ? Number(p[7]) : null,
      rl: p[8] ? Number(p[8]) : null,
      rr: p[9] ? Number(p[9]) : null,
      odometerAtMeasurement: p[10] ? Number(p[10]) : null,
      setupId: p[11],
      installedAt: p[12],
      installedOdometerKm: p[13] ? Number(p[13]) : null,
      initialTreadDepthMm: p[14] ? Number(p[14]) : null,
      initialTreadFrontMm: p[15] ? Number(p[15]) : null,
      initialTreadRearMm: p[16] ? Number(p[16]) : null,
      initialTreadSource: p[17] || null,
      totalKmOnSet: p[18] ? Number(p[18]) : null,
      kFactorFront: Number(p[19]) || 1,
      kFactorRear: Number(p[20]) || 1,
      kFactorCalibrationCount: Number(p[21]) || 0,
      tireSeason: p[22] || 'ALL_SEASON',
      fuelType: p[23] || 'unknown',
      driveType: p[24] || null,
      curbWeightKg: p[25] ? Number(p[25]) : null,
      frontWeightDistributionPct: p[26] ? Number(p[26]) : null,
      aiTireSpecJson: p[27] || null,
      expectedLifeKm: p[28] ? Number(p[28]) : null,
      isStaggered: p[29] === 't',
      frontTireWidthMm: p[30] ? Number(p[30]) : null,
      rearTireWidthMm: p[31] ? Number(p[31]) : null,
    };
  });
}

function resolveSpecSource(row: MeasurementRow): string {
  const spec = row.aiTireSpecJson ? parseAiTireSpec(JSON.parse(row.aiTireSpecJson)) : null;
  if (spec?.userConfirmedSpec) return 'user_confirmed';
  if (spec?.matchedBrand || spec?.matchedModel) return 'ai_spec';
  if (row.initialTreadSource === 'initial_manual_plus_wear') return 'default_spec';
  return 'manual_confirmed';
}

function metrics(values: number[]) {
  const n = values.length;
  if (n === 0) return null;
  const signed = values;
  const abs = signed.map(Math.abs);
  const mae = abs.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(signed.reduce((s, v) => s + v * v, 0) / n);
  const bias = signed.reduce((a, b) => a + b, 0) / n;
  const sorted = [...abs].sort((a, b) => a - b);
  const median = sorted[Math.floor((n - 1) / 2)];
  const p90 = sorted[Math.min(n - 1, Math.ceil(n * 0.9) - 1)];
  const within05 = (abs.filter((v) => v <= 0.5).length / n) * 100;
  const within10 = (abs.filter((v) => v <= 1.0).length / n) * 100;
  const over = (signed.filter((v) => v > 0).length / n) * 100;
  const under = (signed.filter((v) => v < 0).length / n) * 100;
  return { n, mae, rmse, bias, median, p90, within05, within10, over, under };
}

async function main(): Promise<void> {
  if (process.env.TIRE_HEALTH_AUDIT_ALLOW_PROD !== '1') {
    throw new Error('Set TIRE_HEALTH_AUDIT_ALLOW_PROD=1 for supervised read-only backtest.');
  }

  const outputDir = path.resolve(parseArg('--output-dir') ?? path.join(scriptDir, '..', '..', 'docs', 'audits', 'data'));
  const allMeasurements = loadMeasurements();
  const groundTruth = allMeasurements.filter(isGroundTruthMeasurement);

  const bySetup = new Map<string, MeasurementRow[]>();
  for (const m of groundTruth) {
    if (!bySetup.has(m.setupId)) bySetup.set(m.setupId, []);
    bySetup.get(m.setupId)!.push(m);
  }
  for (const list of bySetup.values()) {
    list.sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());
  }

  const rows: BacktestRow[] = [];

  for (const m of groundTruth) {
    const priorList = (bySetup.get(m.setupId) ?? []).filter(
      (p) => new Date(p.measuredAt).getTime() < new Date(m.measuredAt).getTime(),
    );
    const prior = priorList.length > 0 ? priorList[priorList.length - 1] : null;

    let reproducible = false;
    let exclusionReason = '';
    let predicted: { fl: number; fr: number; rl: number; rr: number } | null = null;
    let distanceSinceBaselineKm: number | null = null;
    let baselineSource = prior ? 'prior_manual_measurement' : 'none';
    let odometerAnchorMethod = '';

    if (!prior) {
      exclusionReason = 'first_measurement_no_prior_anchor_for_as_of';
    } else {
      const odoPrior = prior.odometerAtMeasurement ?? snapshotOdometer(m.vehicleId, prior.measuredAt);
      const odoTarget = m.odometerAtMeasurement ?? snapshotOdometer(m.vehicleId, m.measuredAt);
      odometerAnchorMethod = [
        prior.odometerAtMeasurement ? 'prior_direct' : (odoPrior != null ? 'prior_snapshot_window' : 'none'),
        m.odometerAtMeasurement ? 'target_direct' : (odoTarget != null ? 'target_snapshot_window' : 'none'),
      ].join('+');
      if (odoPrior == null || odoTarget == null) {
        exclusionReason = 'missing_odometer_anchor_at_measurement_times';
      } else {
        distanceSinceBaselineKm = odoTarget - odoPrior;
        if (distanceSinceBaselineKm < 0) {
          exclusionReason = 'odometer_non_monotonic';
        } else {
          const anchor = {
            fl: prior.fl ?? prior.initialTreadFrontMm ?? 8,
            fr: prior.fr ?? prior.initialTreadFrontMm ?? 8,
            rl: prior.rl ?? prior.initialTreadRearMm ?? 8,
            rr: prior.rr ?? prior.initialTreadRearMm ?? 8,
          };
          const usage = tripsBefore(m.vehicleId, m.measuredAt);
          const asOfSetup = {
            ...m,
            kFactorFront: prior.isCalibrationPoint ? m.kFactorFront : prior.kFactorFront,
            kFactorRear: prior.isCalibrationPoint ? m.kFactorRear : prior.kFactorRear,
            kFactorCalibrationCount: Math.max(0, prior.kFactorCalibrationCount),
          };
          predicted = projectTreadAsOf({
            anchor,
            kmSince: distanceSinceBaselineKm,
            setup: asOfSetup,
            vehicle: {
              fuelType: m.fuelType,
              driveType: m.driveType,
              curbWeightKg: m.curbWeightKg,
              frontWeightDistributionPct: m.frontWeightDistributionPct,
            },
            usage,
          });
          reproducible = true;
          exclusionReason = '';
        }
      }
    }

    const ageDays = prior
      ? Math.floor((new Date(m.measuredAt).getTime() - new Date(prior.measuredAt).getTime()) / 86400000)
      : null;
    const confLevel = classifyConfidenceLevel({
      hasMeasurement: prior != null,
      measurementAgeDays: ageDays,
      kmSinceMeasurement: distanceSinceBaselineKm,
      hasWearBaseline: true,
    });
    const confidence = confidenceLevelToLabel(confLevel);
    const pressureCov = pressureCoverageAt(m.vehicleId, m.measuredAt);

    const spec = m.aiTireSpecJson ? parseAiTireSpec(JSON.parse(m.aiTireSpecJson)) : null;
    const refNew = resolveReferenceNewTread(
      m.initialTreadFrontMm, m.initialTreadRearMm, m.initialTreadDepthMm,
      spec, resolveArchetype(spec, m.tireSeason), m.tireSeason,
    );

    for (const w of WHEELS) {
      const measured = wheelValue(m, w);
      if (measured == null) continue;
      const predVal = reproducible && predicted ? predicted[w.toLowerCase() as 'fl' | 'fr' | 'rl' | 'rr'] : null;
      const signed = predVal != null ? round3(predVal - measured) : '';
      const absErr = predVal != null ? round3(Math.abs(predVal - measured)) : '';

      rows.push({
        anonymizedVehicleId: m.anonId,
        tireSetupClass: classifySetup(m),
        measurementTimestamp: m.measuredAt,
        wheelPosition: w,
        groundTruthSource: normalizeGroundTruthSource(m.source),
        predictedTreadMm: predVal ?? '',
        measuredTreadMm: measured,
        signedErrorMm: signed,
        absoluteErrorMm: absErr,
        confidence,
        specSource: resolveSpecSource(m),
        baselineSource: prior ? baselineSource : refNew.source,
        pressureCoverage: pressureCov,
        distanceSinceBaselineKm: distanceSinceBaselineKm ?? '',
        modelVersion: MODEL_VERSION,
        reproducible,
        exclusionReason: reproducible ? (exclusionReason || '') : exclusionReason,
      });
    }
  }

  const reproducibleRows = rows.filter((r) => r.reproducible && typeof r.signedErrorMm === 'number');
  const signedErrors = reproducibleRows.map((r) => r.signedErrorMm as number);
  const agg = metrics(signedErrors);

  const calibrationBuckets = new Map<string, number[]>();
  for (const r of reproducibleRows) {
    const key = r.confidence;
    if (!calibrationBuckets.has(key)) calibrationBuckets.set(key, []);
    calibrationBuckets.get(key)!.push(r.signedErrorMm as number);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const header = Object.keys(rows[0] ?? {}) as (keyof BacktestRow)[];
  const csv = [header.join(','), ...rows.map((r) => header.map((h) => String(r[h] ?? '')).join(','))].join('\n');
  const outPath = path.join(outputDir, 'tire-health-backtest-summary-2026-07.csv');
  fs.writeFileSync(outPath, csv, 'utf8');

  const uniqueVehicles = new Set(groundTruth.map((m) => m.anonId)).size;
  const uniqueSetups = new Set(groundTruth.map((m) => m.setupId)).size;
  const reproducibleMeasurements = new Set(reproducibleRows.map((r) => `${r.anonymizedVehicleId}|${r.measurementTimestamp}`)).size;

  const summary = {
    auditId: AUDIT_ID,
    completedAt: new Date().toISOString(),
    modelVersion: MODEL_VERSION,
    modelVersionPersistedInDb: false,
    groundTruthMeasurements: groundTruth.length,
    groundTruthWheelReadings: rows.length,
    vehicles: uniqueVehicles,
    tireSetups: uniqueSetups,
    reproducibleBacktests: reproducibleMeasurements,
    reproducibleWheelReadings: reproducibleRows.length,
    metrics: agg,
    calibrationMatrix: [...calibrationBuckets.entries()].map(([bucket, errs]) => ({
      confidenceBucket: bucket,
      predictions: errs.length,
      ...metrics(errs),
      verdict: bucket === 'High' && agg && agg.mae > 0.5 ? 'miscalibrated_high_bucket' : 'insufficient_n',
    })),
    verdict: reproducibleRows.length < 8 ? 'NOT_ENOUGH_DATA' : agg && Math.abs(agg.bias) > 1 ? 'PARTIALLY_VALIDATED' : 'NOT_ENOUGH_DATA',
    outputFile: outPath,
    writesPerformed: false,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
