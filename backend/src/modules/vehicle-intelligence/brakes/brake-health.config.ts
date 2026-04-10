/**
 * Brake Health Tracking Module V2 — Centralized Configuration
 *
 * ALL tunable constants for the brake wear model live here.
 * Surfaced in Master Admin → Health Tracking Module → Brake Config section.
 */

export const BRAKE_HEALTH_CONFIG = {
  MODEL_VERSION: '1.0.0',

  // ── Pad thresholds ──────────────────────────────────────────────────────────

  pad: {
    warningMm: 3.0,
    criticalMm: 2.0,
    /** Expected total pad life in km before critical (base, ICE, balanced usage). */
    baseLifeKm: 70000,
  },

  // ── Disc thresholds ─────────────────────────────────────────────────────────

  disc: {
    /** Maximum total wear in mm before a disc is considered worn out. */
    maxWearMm: 2.0,
    warningWearMm: 1.5,
    /** Expected total disc life in km before maxWear (base, ICE, balanced). */
    baseLifeKm: 90000,
  },

  // ── Brake bias defaults ─────────────────────────────────────────────────────

  brakeBias: {
    /** Used when brakeForceFrontPercent is null and EBD is assumed. */
    defaultFront: 0.72,
    defaultRear: 0.28,
    frontHeavy: { front: 0.74, rear: 0.26 },
    balanced: { front: 0.70, rear: 0.30 },
    rearBiased: { front: 0.68, rear: 0.32 },
  },

  // ── Pad usage factors (from DI Engine city/highway/country split) ───────────

  padUsageFactors: {
    city: 1.35,
    highway: 0.78,
    countryRoad: 1.00,
  },

  // ── Pad stop density factor ─────────────────────────────────────────────────

  padStopDensityAnchors: [
    { threshold: 0.08, factor: 1.00 },
    { threshold: 0.16, factor: 1.05 },
    { threshold: 0.24, factor: 1.10 },
    { threshold: Infinity, factor: 1.16 },
  ],

  // ── Pad hard brake factor (hardBrakePer100Km) ──────────────────────────────

  padHardBrakeAnchors: [
    { threshold: 1.0, factor: 1.00 },
    { threshold: 2.5, factor: 1.05 },
    { threshold: 4.5, factor: 1.10 },
    { threshold: Infinity, factor: 1.18 },
  ],

  // ── Pad full braking factor (fullBrakingPer100Km) ──────────────────────────

  padFullBrakingAnchors: [
    { threshold: 0, factor: 1.00 },
    { threshold: 0.5, factor: 1.03 },
    { threshold: 1.0, factor: 1.07 },
    { threshold: Infinity, factor: 1.12 },
  ],

  // ── Pad reku (regen) factors by powertrain ─────────────────────────────────

  padRekuFactors: {
    ICE: 1.00,
    GASOLINE: 1.00,
    DIESEL: 1.00,
    HEV: 0.88,
    HYBRID: 0.88,
    PHEV: 0.82,
    PLUGIN_HYBRID: 0.82,
    EV: 0.72,
    ELECTRIC: 0.72,
    OTHER: 1.00,
  } as Record<string, number>,

  // ── Disc usage factors ──────────────────────────────────────────────────────

  discUsageFactors: {
    city: 1.20,
    highway: 0.85,
    countryRoad: 1.00,
  },

  // ── Disc high-speed brake factor (highSpeedBrakeShare %) ───────────────────

  discHighSpeedBrakeAnchors: [
    { threshold: 5, factor: 1.00 },
    { threshold: 12, factor: 1.06 },
    { threshold: 20, factor: 1.12 },
    { threshold: Infinity, factor: 1.18 },
  ],

  // ── Disc hard brake factor ─────────────────────────────────────────────────

  discHardBrakeAnchors: [
    { threshold: 1, factor: 1.00 },
    { threshold: 2.5, factor: 1.04 },
    { threshold: 4.5, factor: 1.08 },
    { threshold: Infinity, factor: 1.14 },
  ],

  // ── Disc full braking factor ───────────────────────────────────────────────

  discFullBrakingAnchors: [
    { threshold: 0, factor: 1.00 },
    { threshold: 0.5, factor: 1.04 },
    { threshold: 1.0, factor: 1.09 },
    { threshold: Infinity, factor: 1.15 },
  ],

  // ── Disc thermal factor (from thermalBrakeStressScore 0–100) ───────────────

  discThermalAnchors: [
    { score: 20, factor: 1.00 },
    { score: 50, factor: 1.06 },
    { score: 75, factor: 1.12 },
    { score: 100, factor: 1.20 },
  ],

  // ── Disc reku factors ──────────────────────────────────────────────────────

  discRekuFactors: {
    ICE: 1.00,
    GASOLINE: 1.00,
    DIESEL: 1.00,
    HEV: 0.94,
    HYBRID: 0.94,
    PHEV: 0.90,
    PLUGIN_HYBRID: 0.90,
    EV: 0.86,
    ELECTRIC: 0.86,
    OTHER: 1.00,
  } as Record<string, number>,

  // ── Calibration ─────────────────────────────────────────────────────────────

  calibration: {
    padMinK: 0.70,
    padMaxK: 1.35,
    discMinK: 0.75,
    discMaxK: 1.30,
    alphaFirst: 0.12,
    alphaFew: 0.18,
    alphaStabilized: 0.24,
    fewThreshold: 3,
    stabilizedThreshold: 4,
    minPredictedWearMm: 0.3,
  },

  // ── Confidence scoring (point-based 0–100) ─────────────────────────────────

  confidence: {
    padAnchors: 20,
    rotorAnchors: 10,
    serviceEvents: 12,
    drivingImpactData: 15,
    brakingMetrics: 10,
    usageData: 8,
    odometerAvailable: 10,
    measurementExists: 8,
    calibrationStabilized: 5,
  },

  confidenceThresholds: {
    high: 80,
    medium: 55,
  },

  // ── Set-level health weights ────────────────────────────────────────────────

  setLevel: {
    minWeight: 0.60,
    avgWeight: 0.40,
  },

  // ── Alerts ──────────────────────────────────────────────────────────────────

  alerts: {
    lowRemainingKm: 3000,
    criticalRemainingKm: 1000,
    highBrakeStressThreshold: 70,
    lowConfidenceThreshold: 55,
  },
} as const;

export type BrakeHealthConfig = typeof BRAKE_HEALTH_CONFIG;
