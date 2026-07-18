import { describe, expect, it } from '@jest/globals';
import {
  buildSubaccountEnvKey,
  persistSubaccountCredentialsToEnvFile,
} from './voice-staging-subaccount-env.util';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('voice-staging-subaccount-env.util', () => {
  it('builds stable env keys', () => {
    expect(buildSubaccountEnvKey('org-voice-staging-e2e')).toBe(
      'VOICE_TWILIO_SUB_ORG_VOICE_STAGING_E2E',
    );
  });

  it('persists credentials without duplicating keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-staging-env-'));
    const file = path.join(dir, 'backend.env');
    fs.writeFileSync(file, 'FOO=bar\n', 'utf8');
    persistSubaccountCredentialsToEnvFile(file, 'org-voice-staging-e2e', {
      accountSid: 'AC123',
      apiKeySid: 'SK123',
      apiKeySecret: 'secret',
      authToken: 'token',
    });
    const content = fs.readFileSync(file, 'utf8');
    expect(content).toContain('VOICE_TWILIO_SUB_ORG_VOICE_STAGING_E2E=');
    expect(content).toContain('AC123');
    persistSubaccountCredentialsToEnvFile(file, 'org-voice-staging-e2e', {
      accountSid: 'AC456',
      apiKeySid: 'SK456',
      apiKeySecret: 'secret2',
      authToken: 'token2',
    });
    const updated = fs.readFileSync(file, 'utf8');
    expect(updated.match(/VOICE_TWILIO_SUB_ORG_VOICE_STAGING_E2E=/g)?.length).toBe(1);
    expect(updated).toContain('AC456');
  });
});
