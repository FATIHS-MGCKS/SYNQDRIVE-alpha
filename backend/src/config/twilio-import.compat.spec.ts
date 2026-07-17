import { getTwilioClient, resetTwilioClientForTests } from './twilio-client.util';

describe('twilio SDK import compatibility', () => {
  const saved = {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    apiKeySid: process.env.TWILIO_API_KEY_SID,
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET,
  };

  beforeEach(() => {
    resetTwilioClientForTests();
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_API_KEY_SID;
    delete process.env.TWILIO_API_KEY_SECRET;
  });

  afterAll(() => {
    if (saved.accountSid !== undefined) {
      process.env.TWILIO_ACCOUNT_SID = saved.accountSid;
    }
    if (saved.apiKeySid !== undefined) {
      process.env.TWILIO_API_KEY_SID = saved.apiKeySid;
    }
    if (saved.apiKeySecret !== undefined) {
      process.env.TWILIO_API_KEY_SECRET = saved.apiKeySecret;
    }
  });

  it('loads the SDK module and returns null without credentials (no network I/O)', () => {
    expect(getTwilioClient()).toBeNull();
  });
});
