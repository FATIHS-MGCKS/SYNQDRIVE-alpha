import { MisuseCaseStatus } from '@prisma/client';
import {
  planMisuseCaseReconciliation,
  SUPERSEDE_RESOLUTION_REASON,
} from './misuse-case-fingerprint.reconciliation';
import { buildMisuseCaseFingerprintPair } from './misuse-case-fingerprint';
import { MISUSE_CASE_FINGERPRINT_VERSION } from './misuse-case-fingerprint.config';
import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';

describe('misuse-case-fingerprint.reconciliation', () => {
  const fingerprints = buildMisuseCaseFingerprintPair({
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    scope: { kind: 'TRIP', tripId: 'trip-1' },
    category: MisuseCaseCategory.MISUSE_SUSPICION,
    caseType: MisuseCaseType.BRAKE_ABUSE_PATTERN,
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    evidence: [
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'ev-1',
        eventType: 'FULL_BRAKING',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
    ],
    modelVersion: MISUSE_CASE_FINGERPRINT_VERSION,
  });

  const v1Fingerprints = buildMisuseCaseFingerprintPair({
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    scope: { kind: 'TRIP', tripId: 'trip-1' },
    category: MisuseCaseCategory.MISUSE_SUSPICION,
    caseType: MisuseCaseType.BRAKE_ABUSE_PATTERN,
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    evidence: [
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'ev-1',
        eventType: 'FULL_BRAKING',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
    ],
    modelVersion: 'misuse-fingerprint-v0',
  });

  it('plans UPDATE for exact fingerprint repetition', () => {
    const plan = planMisuseCaseReconciliation(
      {
        id: 'case-1',
        fingerprint: fingerprints.caseFingerprint,
        inputFingerprint: fingerprints.logicalFingerprint,
        modelVersion: fingerprints.modelVersion,
        status: MisuseCaseStatus.REVIEW_REQUIRED,
      },
      null,
      fingerprints,
    );
    expect(plan).toEqual({ action: 'UPDATE', existingId: 'case-1' });
  });

  it('plans SUPERSEDE when model version changes for same logical fingerprint', () => {
    const plan = planMisuseCaseReconciliation(
      null,
      {
        id: 'case-old',
        fingerprint: v1Fingerprints.caseFingerprint,
        inputFingerprint: v1Fingerprints.logicalFingerprint,
        modelVersion: v1Fingerprints.modelVersion,
        status: MisuseCaseStatus.ACTIVE,
      },
      fingerprints,
    );
    expect(plan).toEqual({ action: 'SUPERSEDE', priorCaseId: 'case-old' });
  });

  it('plans CREATE for new evidence pattern', () => {
    const other = buildMisuseCaseFingerprintPair({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      scope: { kind: 'TRIP', tripId: 'trip-1' },
      category: MisuseCaseCategory.MISUSE_SUSPICION,
      caseType: MisuseCaseType.BRAKE_ABUSE_PATTERN,
      attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'ev-99',
          eventType: 'FULL_BRAKING',
          occurredAt: new Date('2026-07-16T18:00:00Z'),
        },
      ],
      modelVersion: MISUSE_CASE_FINGERPRINT_VERSION,
    });

    const plan = planMisuseCaseReconciliation(null, null, other);
    expect(plan.action).toBe('CREATE');
  });

  it('exposes stable supersede resolution reason without free text', () => {
    expect(SUPERSEDE_RESOLUTION_REASON).toContain('Modellversion');
    expect(SUPERSEDE_RESOLUTION_REASON).not.toMatch(/[äöüÄÖÜß]/);
  });
});
