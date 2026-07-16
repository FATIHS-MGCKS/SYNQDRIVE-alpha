import {
  MisuseAttributionScope,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
  TripAssignmentStatus,
} from '@prisma/client';
import {
  applyTelemetryLifecycle,
  canConfirmMisuseCase,
  hasHigherValueEvidenceForConfirmation,
  resolveAttributionConfidence,
} from './misuse-case-lifecycle.transition';

describe('misuse-case-lifecycle.transition', () => {
  describe('applyTelemetryLifecycle', () => {
    it('creates CANDIDATE for low evidence telemetry', () => {
      const result = applyTelemetryLifecycle({
        caseType: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
        evidenceLevel: 'INFO',
        eventCount: 2,
        evidenceCount: 2,
        attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        isPrivateTrip: false,
        inputFingerprint: 'fp-1',
        modelVersion: 'misuse-case-lifecycle-v1',
        analysisRunId: null,
        existing: null,
      });

      expect(result.status).toBe(MisuseCaseStatus.CANDIDATE);
      expect(result.decisionEligibility).toBe('INFORMATIONAL_ONLY');
      expect(result.informationalOnly).toBe(true);
    });

    it('creates REVIEW_REQUIRED when evidence meets review threshold', () => {
      const result = applyTelemetryLifecycle({
        caseType: MisuseCaseType.BRAKE_ABUSE_PATTERN,
        evidenceLevel: 'CHECK_RECOMMENDED',
        eventCount: 3,
        evidenceCount: 3,
        attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        isPrivateTrip: false,
        inputFingerprint: 'fp-2',
        modelVersion: 'misuse-case-lifecycle-v1',
        analysisRunId: 'run-1',
        existing: null,
      });

      expect(result.status).toBe(MisuseCaseStatus.REVIEW_REQUIRED);
      expect(result.decisionEligibility).toBe('REVIEW_ONLY');
      expect(result.informationalOnly).toBe(true);
    });

    it('never auto-confirms on telemetry reprocess', () => {
      const result = applyTelemetryLifecycle({
        caseType: MisuseCaseType.DIMO_COLLISION_REPORTED,
        evidenceLevel: 'CRITICAL_DAMAGE_RISK',
        eventCount: 1,
        evidenceCount: 1,
        attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        isPrivateTrip: false,
        inputFingerprint: 'fp-3',
        modelVersion: 'misuse-case-lifecycle-v1',
        analysisRunId: null,
        existing: {
          status: MisuseCaseStatus.REVIEW_REQUIRED,
          modelVersion: 'misuse-case-lifecycle-v1',
          inputFingerprint: 'fp-3',
          analysisRunId: null,
          evidenceCount: 1,
          attributionConfidence: 'HIGH',
          decisionEligibility: 'REVIEW_ONLY',
          informationalOnly: true,
          resolvedAt: null,
          resolutionReason: null,
        },
      });

      expect(result.status).not.toBe(MisuseCaseStatus.CONFIRMED);
      expect(result.informationalOnly).toBe(true);
    });

    it('preserves manual CONFIRMED on reprocess', () => {
      const result = applyTelemetryLifecycle({
        caseType: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
        evidenceLevel: 'DAMAGE_RISK',
        eventCount: 2,
        evidenceCount: 2,
        attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        isPrivateTrip: false,
        inputFingerprint: 'fp-4',
        modelVersion: 'misuse-case-lifecycle-v1',
        analysisRunId: null,
        existing: {
          status: MisuseCaseStatus.CONFIRMED,
          modelVersion: 'misuse-case-lifecycle-v1',
          inputFingerprint: 'fp-4',
          analysisRunId: null,
          evidenceCount: 2,
          attributionConfidence: 'HIGH',
          decisionEligibility: 'OPERATIONAL_ELIGIBLE',
          informationalOnly: false,
          resolvedAt: null,
          resolutionReason: 'Manuell bestätigt',
        },
      });

      expect(result.status).toBe(MisuseCaseStatus.CONFIRMED);
      expect(result.decisionEligibility).toBe('OPERATIONAL_ELIGIBLE');
    });

    it('upgrades to ACTIVE when evidence count grows', () => {
      const result = applyTelemetryLifecycle({
        caseType: MisuseCaseType.COLD_ENGINE_ABUSE,
        evidenceLevel: 'INFO',
        eventCount: 4,
        evidenceCount: 4,
        attributionScope: MisuseAttributionScope.VEHICLE_ONLY,
        assignmentStatus: null,
        isPrivateTrip: false,
        inputFingerprint: 'fp-5',
        modelVersion: 'misuse-case-lifecycle-v1',
        analysisRunId: null,
        existing: {
          status: MisuseCaseStatus.CANDIDATE,
          modelVersion: 'misuse-case-lifecycle-v1',
          inputFingerprint: 'fp-5',
          analysisRunId: null,
          evidenceCount: 2,
          attributionConfidence: 'MEDIUM',
          decisionEligibility: 'INFORMATIONAL_ONLY',
          informationalOnly: true,
          resolvedAt: null,
          resolutionReason: null,
        },
      });

      expect(result.status).toBe(MisuseCaseStatus.ACTIVE);
    });

    it('maps NONE evidence to NOT_ASSESSABLE', () => {
      const result = applyTelemetryLifecycle({
        caseType: MisuseCaseType.TELEMETRY_INTEGRITY_ISSUE,
        evidenceLevel: 'NONE',
        eventCount: 0,
        evidenceCount: 0,
        attributionScope: MisuseAttributionScope.UNKNOWN,
        assignmentStatus: TripAssignmentStatus.UNKNOWN_ASSIGNMENT,
        isPrivateTrip: false,
        inputFingerprint: 'fp-6',
        modelVersion: 'misuse-case-lifecycle-v1',
        analysisRunId: null,
        existing: null,
      });

      expect(result.status).toBe(MisuseCaseStatus.NOT_ASSESSABLE);
      expect(result.decisionEligibility).toBe('NOT_ELIGIBLE');
    });
  });

  describe('canConfirmMisuseCase', () => {
    it('blocks confirmation without manual or high-value evidence', () => {
      expect(
        canConfirmMisuseCase({
          caseType: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
          evidenceLevel: 'CHECK_RECOMMENDED',
          evidenceSources: [MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT],
          status: MisuseCaseStatus.REVIEW_REQUIRED,
        }),
      ).toBe(false);
    });

    it('allows confirmation with manual verification evidence', () => {
      expect(
        canConfirmMisuseCase({
          caseType: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
          evidenceLevel: 'CHECK_RECOMMENDED',
          evidenceSources: [MisuseEvidenceSourceType.MANUAL_VERIFICATION],
          status: MisuseCaseStatus.REVIEW_REQUIRED,
        }),
      ).toBe(true);
    });

    it('allows confirmation for provider collision with DIMO evidence', () => {
      expect(
        hasHigherValueEvidenceForConfirmation({
          caseType: MisuseCaseType.DIMO_COLLISION_REPORTED,
          evidenceLevel: 'CRITICAL_DAMAGE_RISK',
          evidenceSources: [MisuseEvidenceSourceType.DIMO_EVENT],
        }),
      ).toBe(true);
    });
  });

  describe('resolveAttributionConfidence', () => {
    it('returns LOW for private trips', () => {
      expect(
        resolveAttributionConfidence({
          attributionScope: MisuseAttributionScope.PRIVATE_UNASSIGNED,
          assignmentStatus: TripAssignmentStatus.PRIVATE_UNASSIGNED,
          isPrivateTrip: true,
        }),
      ).toBe('LOW');
    });
  });
});
