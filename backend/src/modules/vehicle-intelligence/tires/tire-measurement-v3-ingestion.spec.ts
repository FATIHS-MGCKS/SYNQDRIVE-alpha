import { TireEvidenceSource } from '@prisma/client';
import {
  assessV3Ingestion,
  isGroundTruthMeasurementCommand,
  isOdometerExplicitlyConfirmed,
  resolveExplicitMeasurementOdometerKm,
  resolvePersistedMeasurementOdometerKm,
  validateTreadMmValues,
} from './tire-measurement-v3-ingestion';
import type { RecordTireMeasurementCommand } from './tire-lifecycle.service';
import { TireOdometerAnchorStatus } from '@prisma/client';

const mount = {
  id: 'mp-1',
  installedAt: new Date('2026-01-01T00:00:00Z'),
  removedAt: null,
  installedOdometerKm: 1000,
  odometerAnchorStatus: TireOdometerAnchorStatus.ANCHORED,
};

describe('tire-measurement-v3-ingestion', () => {
  it('requires explicit confirm for ground-truth odometer capture', () => {
    const cmd: RecordTireMeasurementCommand = {
      vehicleId: 'v1',
      odometerKm: 5000,
      source: 'manual',
    };
    expect(isOdometerExplicitlyConfirmed(cmd)).toBe(false);
    expect(resolveExplicitMeasurementOdometerKm(cmd)).toBeNull();
    expect(
      resolvePersistedMeasurementOdometerKm({
        groundTruth: true,
        explicitOdometerKm: null,
        inferredOdometerKm: 4800,
      }),
    ).toBeNull();
  });

  it('accepts workshop source as explicit odometer confirmation', () => {
    const cmd: RecordTireMeasurementCommand = {
      vehicleId: 'v1',
      odometerKm: 5000,
      source: 'workshop',
    };
    expect(resolveExplicitMeasurementOdometerKm(cmd)).toBe(5000);
  });

  it('rejects ai_confirmed for ground truth', () => {
    expect(
      isGroundTruthMeasurementCommand(
        'ai_confirmed',
        TireEvidenceSource.USER_CONFIRMED,
      ),
    ).toBe(false);
  });

  it('flags missing explicit odometer for V3 verification', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: null,
      inferredAnchor: {
        odometerKm: 1200,
        source: 'VEHICLE_LATEST_STATE' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 80,
        plausibilityIssue: null,
        clientValueIgnored: true,
      },
      treadValues: {
        frontLeftMm: 7,
        frontRightMm: 7,
        rearLeftMm: 7,
        rearRightMm: 7,
      },
      priorResult: null,
    });
    expect(assessment.verificationEligible).toBe(false);
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_ODOMETER_NOT_EXPLICIT');
  });

  it('allows verification with explicit odometer on partial wheel measurement', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'manual',
      evidenceSource: TireEvidenceSource.MANUAL_MEASUREMENT,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2000,
      inferredAnchor: {
        odometerKm: 2000,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 85,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: {
        frontLeftMm: 6.5,
        frontRightMm: null,
        rearLeftMm: null,
        rearRightMm: null,
      },
      priorResult: {
        rated: true,
        setupFlags: ['RATE_INSUFFICIENT_POINTS'],
        verification: { status: 'CURRENT' },
      } as never,
    });
    expect(assessment.verificationEligible).toBe(true);
    expect(assessment.posteriorCalibrationEligible).toBe(false);
  });

  it('excludes ai_confirmed legacy source from verification assessment', () => {
    const assessment = assessV3Ingestion({
      legacySource: 'ai_confirmed',
      evidenceSource: TireEvidenceSource.USER_CONFIRMED,
      measuredAt: new Date('2026-02-01T00:00:00Z'),
      mountPeriod: mount,
      explicitOdometerKm: 2000,
      inferredAnchor: {
        odometerKm: 2000,
        source: 'MANUAL_CONFIRMED' as never,
        capturedAt: new Date(),
        evidenceId: null,
        status: TireOdometerAnchorStatus.ANCHORED,
        confidence: 85,
        plausibilityIssue: null,
        clientValueIgnored: false,
      },
      treadValues: {
        frontLeftMm: 6,
        frontRightMm: 6,
        rearLeftMm: 6,
        rearRightMm: 6,
      },
      priorResult: null,
    });
    expect(assessment.verificationEligible).toBe(false);
    expect(assessment.warnings.map((w) => w.code)).toContain('V3_VERIFICATION_SOURCE_EXCLUDED');
  });

  it('validates tread bounds', () => {
    expect(
      validateTreadMmValues({
        frontLeftMm: 21,
        frontRightMm: null,
        rearLeftMm: null,
        rearRightMm: null,
      }),
    ).toContain('20');
  });
});
