/**
 * Seed script for the High Mobility Compatibility matrix (V4.6.77).
 *
 * Populates hm_compatibility_records + hm_compatibility_signals with a
 * realistic starter dataset spanning the brands SynqDrive currently
 * onboards: BMW, Mercedes-Benz, Mini, VW, Audi, Porsche, Skoda, SEAT,
 * CUPRA, Volvo, Tesla, Polestar, Toyota, Renault, Ford.
 *
 * Intent:
 *  - Make the internal Master-Admin compatibility checker testable today.
 *  - Reflect the known behavior of the HM Eligibility API (ELIGIBILITY_FIRST
 *    for BMW/Mercedes/Mini/Volvo/Tesla/..., DIRECT_FLEET_CLEARANCE for VW
 *    Group + Porsche).
 *  - Reflect the HM Health vs. Telemetry app signal split.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/seed-hm-compatibility.ts
 *
 * Idempotent — re-running replaces existing rows for each (brand, model,
 * modelYearFrom, modelYearTo) tuple.
 */

import { PrismaClient } from '@prisma/client';
import type {
  CompatibilityAppStatus,
  CompatibilityConfidence,
  CompatibilityEligibilityMode,
  CompatibilityOnboardingMode,
  CompatibilityOverall,
  SignalCoverage,
} from '../src/modules/high-mobility/compatibility/hm-compatibility.types';
import {
  normalizeToHmBrand,
} from '../src/modules/high-mobility/high-mobility-oem-routing';

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeModel(model: string): string {
  return model
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

type SignalSeed = {
  app: 'HEALTH' | 'TELEMETRY';
  signalKey: string;
  signalLabel: string;
  signalGroup: string;
  required: boolean;
  coverage: SignalCoverage;
  confidence: CompatibilityConfidence;
  notes?: string | null;
};

type RecordSeed = {
  brand: string;
  brandDisplayName: string;
  model: string;
  modelDisplayName: string;
  modelYearFrom: number | null;
  modelYearTo: number | null;
  supportFromText?: string | null;
  eligibilityMode: CompatibilityEligibilityMode;
  onboardingMode: CompatibilityOnboardingMode;
  healthAppStatus?: CompatibilityAppStatus | null;
  telemetryAppStatus?: CompatibilityAppStatus | null;
  overallStatus?: CompatibilityOverall | null;
  supportSource?: string | null;
  confidence: CompatibilityConfidence;
  notes?: string | null;
  signals: SignalSeed[];
};

// ── Canonical signal sets per app ───────────────────────────────────────────
// These match the Signal Groups in the V1 product spec.

function healthSignals(
  partial: Partial<Record<HealthKey, Pick<SignalSeed, 'coverage' | 'confidence' | 'notes'>>> = {},
): SignalSeed[] {
  return HEALTH_SIGNAL_GROUPS.map((g, idx) => ({
    app: 'HEALTH',
    signalKey: g.key,
    signalLabel: g.label,
    signalGroup: g.group,
    required: g.required,
    coverage: partial[g.key]?.coverage ?? 'UNVERIFIED',
    confidence: partial[g.key]?.confidence ?? 'MEDIUM',
    notes: partial[g.key]?.notes ?? null,
  }));
}

function telemetrySignals(
  partial: Partial<Record<TelemetryKey, Pick<SignalSeed, 'coverage' | 'confidence' | 'notes'>>> = {},
): SignalSeed[] {
  return TELEMETRY_SIGNAL_GROUPS.map((g) => ({
    app: 'TELEMETRY',
    signalKey: g.key,
    signalLabel: g.label,
    signalGroup: g.group,
    required: g.required,
    coverage: partial[g.key]?.coverage ?? 'UNVERIFIED',
    confidence: partial[g.key]?.confidence ?? 'MEDIUM',
    notes: partial[g.key]?.notes ?? null,
  }));
}

type HealthKey =
  | 'odometer'
  | 'fuel_level'
  | 'battery_level'
  | 'remaining_range'
  | 'dashboard_warnings'
  | 'service_distance'
  | 'service_time'
  | 'oil_service'
  | 'ignition';

type TelemetryKey =
  | 'gps_latitude'
  | 'gps_longitude'
  | 'gps_timestamp'
  | 'ignition'
  | 'odometer'
  | 'speed'
  | 'heading'
  | 'trip_derivation_readiness';

const HEALTH_SIGNAL_GROUPS: Array<{
  key: HealthKey;
  label: string;
  group: string;
  required: boolean;
}> = [
  { key: 'odometer',            label: 'Odometer',             group: 'Core Metrics',   required: true },
  { key: 'fuel_level',          label: 'Fuel Level',           group: 'Energy',          required: true },
  { key: 'battery_level',       label: 'Battery Level',        group: 'Energy',          required: true },
  { key: 'remaining_range',     label: 'Remaining Range',      group: 'Energy',          required: true },
  { key: 'dashboard_warnings',  label: 'Dashboard Warnings',   group: 'Alerts',          required: true },
  { key: 'service_distance',    label: 'Service Distance',     group: 'Maintenance',     required: true },
  { key: 'service_time',        label: 'Service Time',         group: 'Maintenance',     required: true },
  { key: 'oil_service',         label: 'Oil Service',          group: 'Maintenance',     required: false },
  { key: 'ignition',            label: 'Ignition',             group: 'Core Metrics',   required: true },
];

const TELEMETRY_SIGNAL_GROUPS: Array<{
  key: TelemetryKey;
  label: string;
  group: string;
  required: boolean;
}> = [
  { key: 'gps_latitude',             label: 'GPS Latitude',             group: 'Location',      required: true },
  { key: 'gps_longitude',            label: 'GPS Longitude',            group: 'Location',      required: true },
  { key: 'gps_timestamp',            label: 'GPS Timestamp',            group: 'Location',      required: true },
  { key: 'ignition',                 label: 'Ignition',                 group: 'Core Metrics',  required: true },
  { key: 'odometer',                 label: 'Odometer',                 group: 'Core Metrics',  required: true },
  { key: 'speed',                    label: 'Speed',                    group: 'Driving',       required: false },
  { key: 'heading',                  label: 'Heading',                  group: 'Driving',       required: false },
  { key: 'trip_derivation_readiness',label: 'Trip Derivation Readiness',group: 'Trip',          required: true },
];

// ── Seed records ────────────────────────────────────────────────────────────
// Eligibility + onboarding columns are aligned with
// high-mobility-oem-routing.ts (ELIGIBILITY_SUPPORTED_BRANDS, VW_GROUP_BRANDS,
// PORSCHE_BRANDS). Signal coverage reflects the practical OEM reality.

const REVIEWED_AT = new Date('2026-04-15T12:00:00Z');

const SEED: RecordSeed[] = [
  // ── BMW ────────────────────────────────────────────────────────────────
  {
    brand: 'bmw',
    brandDisplayName: 'BMW',
    model: '3-series',
    modelDisplayName: '3 Series',
    modelYearFrom: 2019,
    modelYearTo: null,
    supportFromText: 'MY 2019+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API + internal testing',
    confidence: 'HIGH',
    notes: 'Full Health + Telemetry support. ICE variants only.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH', notes: '12V starter battery' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },
  {
    brand: 'bmw',
    brandDisplayName: 'BMW',
    model: 'ix',
    modelDisplayName: 'iX',
    modelYearFrom: 2022,
    modelYearTo: null,
    supportFromText: 'MY 2022+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'HIGH',
    notes: 'Full BEV. Fuel level reports zero; use Battery Level + Remaining Range for SoC.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV — fuel level not applicable' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH', notes: 'HV traction battery SoC' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV — no engine oil service' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },

  // ── Mercedes-Benz ──────────────────────────────────────────────────────
  {
    brand: 'mercedes-benz',
    brandDisplayName: 'Mercedes-Benz',
    model: 'a-class',
    modelDisplayName: 'A-Class',
    modelYearFrom: 2018,
    modelYearTo: null,
    supportFromText: 'MY 2018+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'HIGH',
    notes: null,
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },

  // ── Mini ───────────────────────────────────────────────────────────────
  {
    brand: 'mini',
    brandDisplayName: 'Mini',
    model: 'cooper',
    modelDisplayName: 'Cooper',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'HIGH',
    notes: 'BMW Group platform — strong signal parity with BMW.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },

  // ── Volkswagen (VW Group — Direct Fleet Clearance) ─────────────────────
  {
    brand: 'volkswagen',
    brandDisplayName: 'Volkswagen',
    model: 'golf',
    modelDisplayName: 'Golf',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+ (Golf 8 onwards)',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (VW Group direct path)',
    confidence: 'HIGH',
    notes:
      'Eligibility API not supported for VW Group — onboarding uses Direct Fleet Clearance with vw-group-customer-name tag.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'EXPECTED',  confidence: 'MEDIUM', notes: '12V — depends on SoC reporting' },
        remaining_range:    { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        dashboard_warnings: { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
      }),
    ],
  },
  {
    brand: 'volkswagen',
    brandDisplayName: 'Volkswagen',
    model: 'id-4',
    modelDisplayName: 'ID.4',
    modelYearFrom: 2021,
    modelYearTo: null,
    supportFromText: 'MY 2021+',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (VW Group direct path)',
    confidence: 'HIGH',
    notes: 'BEV — fuel level / oil service not applicable.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH', notes: 'HV traction battery' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV — no engine oil' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
      }),
    ],
  },

  // ── Audi (VW Group — Direct Fleet Clearance) ───────────────────────────
  {
    brand: 'audi',
    brandDisplayName: 'Audi',
    model: 'a4',
    modelDisplayName: 'A4',
    modelYearFrom: 2019,
    modelYearTo: null,
    supportFromText: 'MY 2019+ (B9 facelift onwards)',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (VW Group direct path)',
    confidence: 'HIGH',
    notes: 'VW Group — direct fleet clearance required.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
      }),
    ],
  },

  // ── Porsche (Direct Fleet Clearance) ───────────────────────────────────
  {
    brand: 'porsche',
    brandDisplayName: 'Porsche',
    model: 'taycan',
    modelDisplayName: 'Taycan',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (Porsche direct path)',
    confidence: 'MEDIUM',
    notes:
      'Porsche does not support Eligibility API. Direct Connect. BEV — fuel/oil N/A.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_time:       { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        oil_service:        { coverage: 'MISSING',  confidence: 'HIGH' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
      }),
    ],
  },

  // ── Skoda (VW Group) ───────────────────────────────────────────────────
  {
    brand: 'skoda',
    brandDisplayName: 'Skoda',
    model: 'octavia',
    modelDisplayName: 'Octavia',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (VW Group direct path)',
    confidence: 'MEDIUM',
    notes: 'VW Group — direct clearance. Signal parity close to VW Golf.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        remaining_range:    { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'CONFIRMED', confidence: 'HIGH' },
        service_time:       { coverage: 'CONFIRMED', confidence: 'HIGH' },
        oil_service:        { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'LOW' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        trip_derivation_readiness: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
      }),
    ],
  },

  // ── SEAT (VW Group) ────────────────────────────────────────────────────
  {
    brand: 'seat',
    brandDisplayName: 'SEAT',
    model: 'leon',
    modelDisplayName: 'Leon',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (VW Group direct path)',
    confidence: 'MEDIUM',
    notes: null,
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        remaining_range:    { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_time:       { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        oil_service:        { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'LOW' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        trip_derivation_readiness: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
      }),
    ],
  },

  // ── CUPRA (VW Group) ───────────────────────────────────────────────────
  {
    brand: 'cupra',
    brandDisplayName: 'CUPRA',
    model: 'formentor',
    modelDisplayName: 'Formentor',
    modelYearFrom: 2021,
    modelYearTo: null,
    supportFromText: 'MY 2021+',
    eligibilityMode: 'NOT_AVAILABLE',
    onboardingMode: 'DIRECT_CONNECT',
    supportSource: 'HM Fleet Clearance (VW Group direct path)',
    confidence: 'MEDIUM',
    notes: null,
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        battery_level:      { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        remaining_range:    { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        dashboard_warnings: { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_distance:   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_time:       { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        oil_service:        { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        gps_longitude:             { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        gps_timestamp:             { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'LOW' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        trip_derivation_readiness: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
      }),
    ],
  },

  // ── Volvo (Eligibility First) ──────────────────────────────────────────
  {
    brand: 'volvo-cars',
    brandDisplayName: 'Volvo',
    model: 'xc60',
    modelDisplayName: 'XC60',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'MEDIUM',
    notes: null,
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'HIGH' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_time:       { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        oil_service:        { coverage: 'UNVERIFIED',confidence: 'LOW' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },

  // ── Tesla (Eligibility First but limited) ──────────────────────────────
  {
    brand: 'tesla',
    brandDisplayName: 'Tesla',
    model: 'model-3',
    modelDisplayName: 'Model 3',
    modelYearFrom: 2019,
    modelYearTo: null,
    supportFromText: 'MY 2019+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'MEDIUM',
    notes:
      'Tesla via HM has limited service-distance/time signals; use Dashboard Warnings as fallback.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_time:       { coverage: 'UNVERIFIED',confidence: 'LOW' },
        oil_service:        { coverage: 'MISSING',  confidence: 'HIGH' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },

  // ── Polestar ───────────────────────────────────────────────────────────
  {
    brand: 'polestar',
    brandDisplayName: 'Polestar',
    model: '2',
    modelDisplayName: 'Polestar 2',
    modelYearFrom: 2021,
    modelYearTo: null,
    supportFromText: 'MY 2021+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'MEDIUM',
    notes: null,
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'MISSING',  confidence: 'HIGH', notes: 'BEV' },
        battery_level:      { coverage: 'CONFIRMED', confidence: 'HIGH' },
        remaining_range:    { coverage: 'CONFIRMED', confidence: 'HIGH' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_time:       { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        oil_service:        { coverage: 'MISSING',  confidence: 'HIGH' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
    ],
  },

  // ── Renault ────────────────────────────────────────────────────────────
  {
    brand: 'renault',
    brandDisplayName: 'Renault',
    model: 'clio',
    modelDisplayName: 'Clio',
    modelYearFrom: 2020,
    modelYearTo: null,
    supportFromText: 'MY 2020+',
    eligibilityMode: 'VIN_DEPENDENT',
    onboardingMode: 'MANUAL_REVIEW',
    supportSource: 'HM Eligibility API (VIN-specific)',
    confidence: 'LOW',
    notes:
      'Renault connectivity varies heavily by VIN/trim. Eligibility must be checked per VIN — no blanket brand/model support.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        fuel_level:         { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        battery_level:      { coverage: 'UNVERIFIED',confidence: 'LOW' },
        remaining_range:    { coverage: 'UNVERIFIED',confidence: 'LOW' },
        dashboard_warnings: { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_distance:   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_time:       { coverage: 'UNVERIFIED',confidence: 'LOW' },
        oil_service:        { coverage: 'UNVERIFIED',confidence: 'LOW' },
        ignition:           { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        gps_longitude:             { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        gps_timestamp:             { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:                  { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        odometer:                  { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'LOW' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        trip_derivation_readiness: { coverage: 'UNVERIFIED',confidence: 'LOW' },
      }),
    ],
  },

  // ── Ford ───────────────────────────────────────────────────────────────
  {
    brand: 'ford',
    brandDisplayName: 'Ford',
    model: 'focus',
    modelDisplayName: 'Focus',
    modelYearFrom: 2019,
    modelYearTo: null,
    supportFromText: 'MY 2019+',
    eligibilityMode: 'SUPPORT_REQUEST',
    onboardingMode: 'MANUAL_REVIEW',
    supportSource: 'HM Support Request',
    confidence: 'LOW',
    notes:
      'Ford fleet onboarding usually requires HM support ticket — Eligibility API returns indeterminate for many VINs.',
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        fuel_level:         { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        battery_level:      { coverage: 'UNVERIFIED',confidence: 'LOW' },
        remaining_range:    { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        dashboard_warnings: { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_distance:   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_time:       { coverage: 'UNVERIFIED',confidence: 'LOW' },
        oil_service:        { coverage: 'UNVERIFIED',confidence: 'LOW' },
        ignition:           { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        gps_longitude:             { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        gps_timestamp:             { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        ignition:                  { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        odometer:                  { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        speed:                     { coverage: 'UNVERIFIED',confidence: 'LOW' },
        heading:                   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        trip_derivation_readiness: { coverage: 'UNVERIFIED',confidence: 'LOW' },
      }),
    ],
  },

  // ── Toyota ─────────────────────────────────────────────────────────────
  {
    brand: 'toyota',
    brandDisplayName: 'Toyota',
    model: 'corolla',
    modelDisplayName: 'Corolla',
    modelYearFrom: 2019,
    modelYearTo: null,
    supportFromText: 'MY 2019+',
    eligibilityMode: 'AVAILABLE',
    onboardingMode: 'PRECHECK_CONNECT',
    supportSource: 'HM Eligibility API',
    confidence: 'MEDIUM',
    notes: null,
    signals: [
      ...healthSignals({
        odometer:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
        fuel_level:         { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
        battery_level:      { coverage: 'UNVERIFIED',confidence: 'LOW' },
        remaining_range:    { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        dashboard_warnings: { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        service_distance:   { coverage: 'UNVERIFIED',confidence: 'LOW' },
        service_time:       { coverage: 'UNVERIFIED',confidence: 'LOW' },
        oil_service:        { coverage: 'UNVERIFIED',confidence: 'LOW' },
        ignition:           { coverage: 'CONFIRMED', confidence: 'HIGH' },
      }),
      ...telemetrySignals({
        gps_latitude:              { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_longitude:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        gps_timestamp:             { coverage: 'CONFIRMED', confidence: 'HIGH' },
        ignition:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        odometer:                  { coverage: 'CONFIRMED', confidence: 'HIGH' },
        speed:                     { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        heading:                   { coverage: 'EXPECTED',  confidence: 'MEDIUM' },
        trip_derivation_readiness: { coverage: 'CONFIRMED', confidence: 'MEDIUM' },
      }),
    ],
  },
];

// ── Seed runner ────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaClient();
  let inserted = 0;
  let updated = 0;
  let signalRows = 0;

  try {
    for (const seed of SEED) {
      const brand = normalizeToHmBrand(seed.brand);
      const model = normalizeModel(seed.model);

      const existing = await prisma.highMobilityCompatibilityRecord.findFirst({
        where: {
          brand,
          model,
          modelYearFrom: seed.modelYearFrom,
          modelYearTo: seed.modelYearTo,
        },
        select: { id: true },
      });

      const data = {
        brand,
        brandDisplayName: seed.brandDisplayName,
        model,
        modelDisplayName: seed.modelDisplayName,
        modelYearFrom: seed.modelYearFrom,
        modelYearTo: seed.modelYearTo,
        supportFromText: seed.supportFromText ?? null,
        eligibilityMode: seed.eligibilityMode,
        onboardingMode: seed.onboardingMode,
        healthAppStatus: seed.healthAppStatus ?? null,
        telemetryAppStatus: seed.telemetryAppStatus ?? null,
        overallStatus: seed.overallStatus ?? null,
        supportSource: seed.supportSource ?? null,
        confidence: seed.confidence,
        notes: seed.notes ?? null,
        lastReviewedAt: REVIEWED_AT,
      };

      const record = existing
        ? await prisma.highMobilityCompatibilityRecord.update({
            where: { id: existing.id },
            data,
          })
        : await prisma.highMobilityCompatibilityRecord.create({ data });

      if (existing) updated += 1;
      else inserted += 1;

      await prisma.highMobilityCompatibilitySignal.deleteMany({
        where: { compatibilityRecordId: record.id },
      });
      if (seed.signals.length > 0) {
        await prisma.highMobilityCompatibilitySignal.createMany({
          data: seed.signals.map((s, idx) => ({
            compatibilityRecordId: record.id,
            app: s.app,
            signalKey: s.signalKey,
            signalLabel: s.signalLabel,
            signalGroup: s.signalGroup,
            required: s.required,
            coverage: s.coverage,
            confidence: s.confidence,
            notes: s.notes ?? null,
            displayOrder: idx,
          })),
        });
        signalRows += seed.signals.length;
      }
    }

    console.log(
      `[seed-hm-compatibility] Done. records inserted=${inserted} updated=${updated} signals_written=${signalRows}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed-hm-compatibility] Failed:', err);
  process.exit(1);
});
