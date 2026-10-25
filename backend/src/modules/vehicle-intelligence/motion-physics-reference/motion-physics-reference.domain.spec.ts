import {
  MotionPhysicsEvidenceTier,
  MotionPhysicsReferenceSource,
} from '@prisma/client';
import { resolveMotionPhysicsEvidenceTierForCreate } from './motion-physics-reference.domain';

describe('resolveMotionPhysicsEvidenceTierForCreate', () => {
  it('maps Mistral to ESTIMATED', () => {
    expect(resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.MISTRAL_AI)).toBe(
      MotionPhysicsEvidenceTier.ESTIMATED,
    );
  });

  it('maps MANUAL_ENTRY to ESTIMATED unless explicit manualOperatorConfirm', () => {
    expect(resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.MANUAL_ENTRY)).toBe(
      MotionPhysicsEvidenceTier.ESTIMATED,
    );
    expect(
      resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.MANUAL_ENTRY, {
        manualOperatorConfirm: true,
      }),
    ).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
  });

  it('maps document and onboarding sources to CONFIRMED', () => {
    expect(
      resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.ONBOARDING_ACTIVATION),
    ).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
    expect(
      resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.REGISTRATION_CERTIFICATE),
    ).toBe(MotionPhysicsEvidenceTier.CONFIRMED);
  });

  it('forbids OPERATOR_CONFIRMED on create (confirm endpoint only)', () => {
    expect(resolveMotionPhysicsEvidenceTierForCreate(MotionPhysicsReferenceSource.OPERATOR_CONFIRMED)).toBeNull();
  });
});
