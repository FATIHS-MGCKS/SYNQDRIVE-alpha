import {
  VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV,
  VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV,
  VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV,
} from './vsi03-p2c.config';
import { buildVsi03P2cCapturePilotAllowlistJson } from './vsi03-p2c-capture-allowlist';

export function applyVsi03P2cCapturePilotEnv(entry: {
  organizationId: string;
  vehicleId: string;
}): void {
  process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV] = 'true';
  process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV] = 'true';
  process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV] = buildVsi03P2cCapturePilotAllowlistJson([
    entry,
  ]);
}

export function clearVsi03P2cCapturePilotEnv(): void {
  delete process.env[VSI03_P2C_SOURCE_OBSERVATION_CAPTURE_ENV];
  delete process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_ENABLED_ENV];
  delete process.env[VSI03_P2C_CAPTURE_PILOT_ALLOWLIST_JSON_ENV];
}
