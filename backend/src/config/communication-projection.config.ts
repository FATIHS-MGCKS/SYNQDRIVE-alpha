import { registerAs } from '@nestjs/config';
import { COMMUNICATION_PROJECTION_RUNTIME_FLAG } from '@modules/communication/communication.constants';

export const COMMUNICATION_WHATSAPP_PROJECTION_FLAG =
  'COMMUNICATION_CENTER_WHATSAPP_PROJECTION_ENABLED';

export const COMMUNICATION_VOICE_PROJECTION_FLAG =
  'COMMUNICATION_CENTER_VOICE_PROJECTION_ENABLED';

export default registerAs('communicationProjection', () => {
  const globalEnabled = process.env[COMMUNICATION_PROJECTION_RUNTIME_FLAG] === 'true';
  const whatsappEnabled =
    process.env[COMMUNICATION_WHATSAPP_PROJECTION_FLAG] === 'true' || globalEnabled;
  const voiceEnabled =
    process.env[COMMUNICATION_VOICE_PROJECTION_FLAG] === 'true' || globalEnabled;

  const allowlistRaw = process.env.COMMUNICATION_CENTER_PROJECTION_ORG_ALLOWLIST ?? '';
  const orgAllowlist = allowlistRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    whatsappEnabled,
    voiceEnabled,
    globalEnabled,
    orgAllowlist,
  };
});
