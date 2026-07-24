export interface NotificationEnforcementConfig {
  shadowMode: boolean;
  failClosed: boolean;
}

export function readNotificationEnforcementConfig(
  env: NodeJS.ProcessEnv = process.env,
): NotificationEnforcementConfig {
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  return {
    shadowMode: parseBool(env.DATA_AUTH_NOTIFICATION_SHADOW_MODE, true),
    failClosed: parseBool(env.DATA_AUTH_NOTIFICATION_FAIL_CLOSED, isProd ? false : false),
  };
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}
