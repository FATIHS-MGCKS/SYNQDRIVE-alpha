import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import {
  evaluateMotionPhysicsConfirm,
  evaluateMotionPhysicsReferenceCreate,
  evaluateMotionPhysicsVerify,
} from './motion-physics-reference.policy';

describe('motion-physics-reference.policy', () => {
  it('rejects empty payload on create', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: {},
      proposedTier: MotionPhysicsEvidenceTier.ESTIMATED,
      proposedSource: MotionPhysicsReferenceSource.MISTRAL_AI,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('MISSING_REQUIRED_FIELD');
  });

  it('blocks Mistral create when active reference is CONFIRMED', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { systemMotorPowerKw: 150 },
      proposedTier: MotionPhysicsEvidenceTier.ESTIMATED,
      proposedSource: MotionPhysicsReferenceSource.MISTRAL_AI,
      activeTier: MotionPhysicsEvidenceTier.CONFIRMED,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('TIER_DOWNGRADE_FORBIDDEN');
  });

  it('blocks Mistral create when active reference is VERIFIED', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { systemMotorPowerKw: 150 },
      proposedTier: MotionPhysicsEvidenceTier.ESTIMATED,
      proposedSource: MotionPhysicsReferenceSource.MISTRAL_AI,
      activeTier: MotionPhysicsEvidenceTier.VERIFIED,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('TIER_DOWNGRADE_FORBIDDEN');
  });

  it('forbids VERIFIED tier via create endpoint', () => {
    const result = evaluateMotionPhysicsReferenceCreate({
      payload: { curbMassKg: 1800 },
      proposedTier: MotionPhysicsEvidenceTier.VERIFIED,
      proposedSource: MotionPhysicsReferenceSource.REGISTRATION_CERTIFICATE,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('VERIFY_NOT_ALLOWED');
  });

  it('requires validated document for verify', () => {
    const result = evaluateMotionPhysicsVerify({
      isActive: true,
      currentTier: MotionPhysicsEvidenceTier.CONFIRMED,
      documentExtractionId: 'doc-1',
      documentValidated: false,
      identityMatch: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('DOCUMENT_NOT_VALIDATED');
  });

  it('allows confirm on active ESTIMATED row', () => {
    const result = evaluateMotionPhysicsConfirm({
      currentTier: MotionPhysicsEvidenceTier.ESTIMATED,
      isActive: true,
    });
    expect(result.ok).toBe(true);
  });
});
