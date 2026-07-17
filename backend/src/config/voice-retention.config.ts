import { registerAs } from '@nestjs/config';

const boolEnv = (key: string, def: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return def;
  return raw.toLowerCase() === 'true' || raw === '1';
};

export default registerAs('voice', () => ({
  retention: {
    enabled: boolEnv('VOICE_RETENTION_ENABLED', true),
  },
}));
