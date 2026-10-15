import { createHash } from 'node:crypto';
import type { VerifyPhysicalDeviceIdentityDto } from './dto/verify-physical-device-identity.dto';

export function buildIdentityVerificationPayloadFingerprint(
  deviceId: string,
  dto: VerifyPhysicalDeviceIdentityDto,
): string {
  const payload = {
    deviceId,
    attestationKind: dto.attestationKind,
    providerReconciliationVehicleId: dto.providerReconciliationVehicleId ?? null,
    reviewerUserId: dto.reviewerUserId,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
