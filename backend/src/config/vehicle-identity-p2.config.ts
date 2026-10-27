import { registerAs } from '@nestjs/config';

/**
 * P2: Vehicle identity manual entry + Fahrzeugschein OCR review UI (no auto-persist to Vehicle AI V2).
 * Default OFF — production upload/review requires owner storage & privacy attestation.
 */
export default registerAs('vehicleIdentityP2', () => ({
  enabled: (process.env.ZB1_VEHICLE_IDENTITY_P2_ENABLED ?? 'false') === 'true',
}));
