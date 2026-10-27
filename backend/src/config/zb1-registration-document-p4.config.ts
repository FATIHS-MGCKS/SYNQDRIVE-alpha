import { registerAs } from '@nestjs/config';

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

const intEnv = (key: string, def: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
};

/**
 * P4: ZB-I (REGISTRATION_CERTIFICATE) vehicle document storage, ACL, retention hooks.
 * Defaults OFF — production requires explicit GDPR + storage release flags.
 */
export default registerAs('zb1RegistrationDocumentP4', () => ({
  enabled: boolEnv('ZB1_VEHICLE_REGISTRATION_DOCUMENT_P4_ENABLED', false),
  /** Owner attestation that storage encryption + backup posture was reviewed. */
  storageReleaseAcknowledged: boolEnv('ZB1_REGISTRATION_DOCUMENT_P4_STORAGE_RELEASE_ACKNOWLEDGED', false),
  /** Owner attestation for Mistral OCR / DPA / transfer posture (no legal retention period invented). */
  gdprReleaseAcknowledged: boolEnv('ZB1_REGISTRATION_DOCUMENT_P4_GDPR_RELEASE_ACKNOWLEDGED', false),
  /**
   * Days after soft-delete before optional ZB-I timed purge metadata is considered (0 = disabled, not immediate delete).
   * Physical object removal happens on soft-delete (with retry), independent of this value.
   */
  retentionDaysAfterSoftDelete: intEnv('ZB1_REGISTRATION_DOCUMENT_P4_RETENTION_DAYS_AFTER_SOFT_DELETE', 0),
  /** Purge registration certificate extractions on vehicle offboarding when P4 enabled. */
  deleteOnVehicleOffboarding: boolEnv('ZB1_REGISTRATION_DOCUMENT_P4_DELETE_ON_VEHICLE_OFFBOARDING', true),
}));
