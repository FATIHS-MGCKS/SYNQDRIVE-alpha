import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export default registerAs('drivingIntelligenceV2', () => ({
  /** Master post-trip V2 pipeline gate. Default off. */
  masterEnabled: parseBooleanEnv(process.env.DRIVING_INTELLIGENCE_V2_ENABLED, false),
  /** Post-trip DIMO segment validation — never affects live trip FSM. Default off. */
  dimoSegmentValidationEnabled: parseBooleanEnv(
    process.env.DRIVING_V2_DIMO_SEGMENT_VALIDATION_ENABLED,
    false,
  ),
  engineDetectorShadowEnabled: parseBooleanEnv(
    process.env.DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED,
    true,
  ),
  hfDetectorShadowEnabled: parseBooleanEnv(
    process.env.DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED,
    true,
  ),
}));
