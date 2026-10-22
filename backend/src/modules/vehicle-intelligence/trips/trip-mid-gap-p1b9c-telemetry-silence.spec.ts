import { CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS } from './trip-qualified-stop-duration.policy';
import {
  buildMidGapCoreTimeline,
  findMidTripGapCandidate,
  findMidTripGapCandidateWithPolicy,
  getMidGapTelemetrySilenceSuppressReason,
} from './trip-mid-gap-detection.util';
import {
  TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV,
  TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV,
  isTripMidGapTelemetrySilenceHardeningEnabledForVehicle,
} from './trip-mid-gap-telemetry-silence.config';

const PILOT_TIGUAN_VEHICLE_ID = '19fedd4b-c4e8-4de8-a125-dab293326e7e';
const MAX_MS = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS;

/** P1B.9B Tiguan false split — 2026-10-21 UTC (deterministic). */
const TIGUAN_ANCHOR = new Date('2026-10-21T17:46:49.474Z');
const TIGUAN_RESUME = new Date('2026-10-21T17:55:10.435Z');

describe('P1B.9C — mid-gap telemetry silence hardening', () => {
  const tiguanFalseSplitCore = [
    { timestamp: TIGUAN_RESUME.toISOString(), speed: 16, isIgnitionOn: true },
  ];

  const baseParams = {
    maxSameTripQualifiedStopMs: MAX_MS,
    stoppedSpeedKmh: 5,
  };

  it('reproduces Tiguan false-split candidate under legacy policy', () => {
    const candidate = findMidTripGapCandidate({
      corePoints: tiguanFalseSplitCore,
      anchorAt: TIGUAN_ANCHOR,
      ...baseParams,
      telemetrySilenceHardeningEnabled: false,
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.gapMs).toBe(500_961);
    expect(candidate!.firstEndAt.toISOString()).toBe(TIGUAN_ANCHOR.toISOString());
    expect(candidate!.secondStartAt.toISOString()).toBe(
      TIGUAN_RESUME.toISOString(),
    );

    const timeline = buildMidGapCoreTimeline(tiguanFalseSplitCore, TIGUAN_ANCHOR);
    expect(timeline[0]!.syntheticAnchor).toBe(true);
    expect(getMidGapTelemetrySilenceSuppressReason(timeline, candidate!)).toBe(
      'synthetic_anchor_only_stop',
    );
  });

  it('suppresses Tiguan false split when hardening is enabled', () => {
    const candidate = findMidTripGapCandidateWithPolicy({
      corePoints: tiguanFalseSplitCore,
      anchorAt: TIGUAN_ANCHOR,
      ...baseParams,
      telemetrySilenceHardeningEnabled: true,
    });
    expect(candidate).toBeNull();
  });

  it('engine idle: witnessed speed=0, ignition ON, telemetry silence, resume — same trip when hardened', () => {
    const idleStart = new Date('2026-10-21T17:40:00.000Z');
    const resume = new Date(idleStart.getTime() + 520_000);
    const corePoints = [
      {
        timestamp: idleStart.toISOString(),
        speed: 0,
        isIgnitionOn: true,
      },
      { timestamp: resume.toISOString(), speed: 18, isIgnitionOn: true },
    ];
    const anchorAt = new Date(idleStart.getTime() - 120_000);

    const legacy = findMidTripGapCandidateWithPolicy({
      corePoints,
      anchorAt,
      ...baseParams,
      telemetrySilenceHardeningEnabled: false,
    });
    expect(legacy).not.toBeNull();

    const hardened = findMidTripGapCandidateWithPolicy({
      corePoints,
      anchorAt,
      ...baseParams,
      telemetrySilenceHardeningEnabled: true,
    });
    expect(hardened).toBeNull();
  });

  it('preserves split for two trips with ignition-off stationary evidence (not a single speed=0 point)', () => {
    const trip1End = new Date('2026-09-06T10:00:00.000Z');
    const parkedA = new Date(trip1End.getTime() + 60_000);
    const parkedB = new Date(trip1End.getTime() + 180_000);
    const trip2Start = new Date(trip1End.getTime() + 520_000);
    const corePoints = [
      { timestamp: trip1End.toISOString(), speed: 8, isIgnitionOn: true },
      { timestamp: parkedA.toISOString(), speed: 0, isIgnitionOn: false },
      { timestamp: parkedB.toISOString(), speed: 0, isIgnitionOn: false },
      { timestamp: trip2Start.toISOString(), speed: 14, isIgnitionOn: true },
    ];

    for (const hardened of [false, true]) {
      const candidate = findMidTripGapCandidateWithPolicy({
        corePoints,
        anchorAt: null,
        ...baseParams,
        telemetrySilenceHardeningEnabled: hardened,
      });
      expect(candidate).not.toBeNull();
      expect(candidate!.firstEndAt.toISOString()).toBe(parkedB.toISOString());
      expect(candidate!.secondStartAt.toISOString()).toBe(
        trip2Start.toISOString(),
      );
    }
  });

  it('does not treat missing speed as stopped when hardening is enabled', () => {
    const before = new Date('2026-09-06T12:00:00.000Z');
    const after = new Date(before.getTime() + 320_000);
    const candidate = findMidTripGapCandidate({
      corePoints: [
        { timestamp: before.toISOString(), speed: null, isIgnitionOn: true },
        { timestamp: after.toISOString(), speed: 20, isIgnitionOn: true },
      ],
      anchorAt: null,
      ...baseParams,
      telemetrySilenceHardeningEnabled: true,
    });
    expect(candidate).toBeNull();
  });
});

describe('P1B.9C — vehicle canary (global flag + allowlist)', () => {
  const originalEnabled = process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV];
  const originalAllowlist =
    process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV];

  afterEach(() => {
    if (originalEnabled === undefined) {
      delete process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV];
    } else {
      process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV] =
        originalEnabled;
    }
    if (originalAllowlist === undefined) {
      delete process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV];
    } else {
      process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV] =
        originalAllowlist;
    }
  });

  it('global ON without allowlist does not enable hardening for any vehicle', () => {
    process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV] = 'true';
    delete process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV];
    expect(
      isTripMidGapTelemetrySilenceHardeningEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID),
    ).toBe(false);
  });

  it('global ON with allowlist enables hardening only for listed vehicles', () => {
    process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_ENABLED_ENV] = 'true';
    process.env[TRIP_MID_GAP_TELEMETRY_SILENCE_HARDENING_VEHICLE_IDS_ENV] =
      PILOT_TIGUAN_VEHICLE_ID;
    expect(
      isTripMidGapTelemetrySilenceHardeningEnabledForVehicle(PILOT_TIGUAN_VEHICLE_ID),
    ).toBe(true);
    expect(
      isTripMidGapTelemetrySilenceHardeningEnabledForVehicle(
        '00000000-0000-4000-8000-000000000099',
      ),
    ).toBe(false);
  });
});
