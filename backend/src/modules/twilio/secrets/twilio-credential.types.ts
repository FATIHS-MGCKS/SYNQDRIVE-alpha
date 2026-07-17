export type TwilioSubaccountCredentials = {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  /**
   * Subaccount Auth Token — required for ElevenLabs native Twilio import (SID + token).
   * Never persisted outside the secret store. API keys alone are insufficient for EL import.
   */
  authToken?: string;
};
